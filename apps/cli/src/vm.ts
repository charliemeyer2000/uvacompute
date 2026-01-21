import type { Command } from "commander";
import ora, { type Ora } from "ora";
import { spawn } from "child_process";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
  mkdirSync,
  chmodSync,
} from "fs";
import { homedir } from "os";
import { join } from "path";
import { select, confirm } from "@inquirer/prompts";
import { getBaseUrl, loadToken, checkServiceStatus } from "./lib/utils";
import { ensureSSHKeysConfigured, getRegisteredKeys } from "./lib/ssh-utils";
import {
  theme,
  statusColors,
  formatSectionHeader,
  formatDetail,
  formatCommand,
} from "./lib/theme";
import { type VMCreationRequest } from "./lib/types";
import {
  VMCreationResponseSchema,
  VMDeletionResponseSchema,
  VMStatusResponseSchema,
  VMListResponseSchema,
  VM_STATUS_GROUPS,
} from "./lib/schemas";
import {
  VMError,
  VMOperationError,
  VMValidationError,
  VMNetworkError,
  ServiceUnavailableError,
  shouldStopRetrying,
  isTransientError,
  parseErrorResponse,
} from "./lib/errors";
import yaml from "js-yaml";
const BASE_URL = getBaseUrl();

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, "");
}

function formatAge(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return "0m";
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatResources(vm: {
  cpus: number;
  ram: number;
  disk: number;
  gpus: number;
  gpuType?: string | null;
}): string {
  const gpuPart = vm.gpus > 0 ? ` | ${vm.gpus}x ${vm.gpuType}` : "";
  return `${vm.cpus} vCPU | ${vm.ram}GB RAM | ${vm.disk}GB disk${gpuPart}`;
}

function formatStatus(status: string): string {
  const expiredStatuses = new Set([
    "stopped",
    "failed",
    "offline",
    "not_found",
  ]);
  if (expiredStatuses.has(status)) {
    return `${theme.error("●")} Expired`;
  }
  if (status === "ready") {
    return `${theme.success("●")} Ready`;
  }
  return `${theme.warning("●")} Provisioning`;
}

function getStatusMessage(status: string): string {
  const messages: Record<string, string> = {
    not_found: "VM not found",
    pending: "Creating VM...",
    booting: "Booting VM...",
    provisioning: "Provisioning VM (running cloud-init)...",
    ready: "VM is ready!",
    stopping: "Stopping VM...",
    stopped: "VM stopped",
    failed: "VM creation failed",
    offline: "VM offline (node unreachable)",
  };
  return messages[status] || `Status: ${status}`;
}

function parseVMInput(input: string): { name?: string; truncatedId?: string } {
  const match = input.match(/^(.+?)\s+\(([0-9a-f]{8})\)$/);
  if (match) {
    return { name: match[1], truncatedId: match[2] };
  }
  return {};
}

async function fetchAndFilterVMs(
  nameOrVmId: string,
  token: string,
  allowedStatuses?: readonly string[],
): Promise<Array<any>> {
  const vmsResponse = await fetch(`${BASE_URL}/api/vms`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!vmsResponse.ok) {
    throw new Error("Failed to fetch VMs");
  }

  const vmsData = VMListResponseSchema.parse(await vmsResponse.json());

  let filtered = vmsData.vms.filter(
    (v) =>
      v.vmId === nameOrVmId ||
      v.name === nameOrVmId ||
      v.vmId.startsWith(nameOrVmId),
  );

  if (filtered.length === 0) {
    const parsed = parseVMInput(nameOrVmId);
    if (parsed.name && parsed.truncatedId) {
      const parsedName = parsed.name;
      const parsedTruncatedId = parsed.truncatedId;
      filtered = vmsData.vms.filter(
        (v) => v.name === parsedName && v.vmId.startsWith(parsedTruncatedId),
      );
    }
  }

  if (allowedStatuses && allowedStatuses.length > 0) {
    filtered = filtered.filter((v) => allowedStatuses.includes(v.status));
  }

  return filtered;
}

async function selectVM(
  matchingVMs: Array<any>,
  nameOrVmId: string,
): Promise<any> {
  const choices = matchingVMs.map((v) => {
    const statusColor =
      statusColors[v.status as keyof typeof statusColors] || theme.muted;
    const nameDisplay = v.name
      ? theme.emphasis(v.name)
      : theme.muted("(unnamed)");
    return {
      name: `${nameDisplay} - ${theme.muted(v.vmId)} ${statusColor(`[${v.status}]`)} - ${v.cpus}vCPU, ${v.ram}GB RAM`,
      value: v.vmId,
      description: `Created: ${new Date(v.createdAt).toLocaleString()}`,
    };
  });

  console.log(
    theme.warning(
      `\nFound ${matchingVMs.length} VMs matching "${nameOrVmId}"\n`,
    ),
  );

  const selectedVmId = await select({
    message: "Select a VM:",
    choices,
  });

  return matchingVMs.find((v) => v.vmId === selectedVmId);
}

async function pollVMStatus(
  vmId: string,
  token: string,
  spinner: Ora,
): Promise<void> {
  const maxAttempts = 180;
  let attempts = 0;
  let consecutiveTransientErrors = 0;
  const maxConsecutiveTransientErrors = 5;

  while (attempts < maxAttempts) {
    try {
      const statusResponse = await fetch(`${BASE_URL}/api/vms/${vmId}/status`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!statusResponse.ok) {
        const error = await parseErrorResponse(statusResponse);

        if (isTransientError(error)) {
          consecutiveTransientErrors++;
          if (consecutiveTransientErrors >= maxConsecutiveTransientErrors) {
            throw new VMError(
              `${error.message} (persisted after ${maxConsecutiveTransientErrors} attempts)`,
              "PERSISTENT_ERROR",
            );
          }
        } else {
          throw error;
        }
      } else {
        consecutiveTransientErrors = 0;

        const statusData = VMStatusResponseSchema.parse(
          await statusResponse.json(),
        );

        spinner.text = getStatusMessage(statusData.status);

        if (statusData.status === "ready") {
          return;
        } else if (statusData.status === "failed") {
          throw new VMOperationError(statusData.msg || "VM creation failed");
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "ZodError") {
        throw new VMValidationError(
          `Invalid response from server: ${error.message || "Schema validation failed"}`,
        );
      }

      if (error instanceof TypeError || error instanceof SyntaxError) {
        throw new VMNetworkError(`Network or parsing error: ${error.message}`);
      }

      if (error instanceof VMError && error.code === "PERSISTENT_ERROR") {
        throw error;
      }

      if (shouldStopRetrying(error)) {
        throw error;
      }

      if (error instanceof VMError) {
        console.warn(`Transient error during status poll: ${error.message}`);
      } else if (error instanceof Error) {
        console.warn(`Unexpected error during status poll: ${error.message}`);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
    attempts++;
  }

  throw new VMError("Timeout waiting for VM to be ready", "TIMEOUT");
}

async function createVM(options: {
  hours: string;
  cpus?: string;
  ram?: string;
  disk?: string;
  gpus?: string;
  gpuType?: string;
  name?: string;
  startupScript?: string;
  cloudInit?: string;
}): Promise<void> {
  let spinner: Ora | null = null;

  try {
    const token = loadToken();
    if (!token) {
      console.log(
        theme.warning("Not authenticated. Please run 'uva login' first."),
      );
      process.exit(1);
    }

    if (options.startupScript && options.cloudInit) {
      console.log(
        theme.error(
          "Cannot use both --startup-script and --cloud-init flags together",
        ),
      );
      process.exit(1);
    }

    const keysResult = await getRegisteredKeys(token);
    if (!keysResult.success) {
      console.log(theme.error("Failed to check SSH keys. Please try again."));
      console.log(theme.muted(`Error: ${keysResult.error}`));
      process.exit(1);
    }

    if (keysResult.keys.length === 0) {
      const configured = await ensureSSHKeysConfigured(token);
      if (!configured) {
        console.log(
          theme.warning(
            "Continuing without SSH access. You won't be able to SSH into this VM.",
          ),
        );
        console.log();
      }
    }

    if (options.name) {
      const vmsResponse = await fetch(`${BASE_URL}/api/vms`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (vmsResponse.ok) {
        const vmsData = VMListResponseSchema.parse(await vmsResponse.json());
        const duplicateVMs = vmsData.vms.filter(
          (vm) => vm.name === options.name,
        );

        if (duplicateVMs.length > 0) {
          console.log(
            theme.warning(
              `\nWarning: Found ${duplicateVMs.length} existing VM(s) with the name "${options.name}":`,
            ),
          );
          for (const vm of duplicateVMs) {
            const statusColor =
              statusColors[vm.status as keyof typeof statusColors] ||
              theme.muted;
            console.log(
              `  • ${theme.muted(vm.vmId)} ${statusColor(`[${vm.status}]`)}`,
            );
          }
          console.log();

          const shouldContinue = await confirm({
            message: "Do you want to continue creating a VM with this name?",
            default: false,
          });

          if (!shouldContinue) {
            console.log(theme.muted("VM creation cancelled."));
            process.exit(0);
          }
          console.log();
        }
      }
    }

    spinner = ora("Creating VM...").start();

    // Parse and validate input
    const hours = parseInt(options.hours, 10);
    if (isNaN(hours) || hours < 1) {
      spinner.fail("Invalid hours. Must be a positive integer.");
      process.exit(1);
    }

    const requestBody: Partial<VMCreationRequest> = {
      hours,
    };

    if (options.name) requestBody.name = options.name;

    const defaultDisk = 64;
    if (options.cpus) {
      const cpus = parseInt(options.cpus, 10);
      if (isNaN(cpus)) {
        spinner.fail("Invalid CPUs value. Must be a number.");
        process.exit(1);
      }
      requestBody.cpus = cpus;
    }

    if (options.ram) {
      const ram = parseInt(options.ram, 10);
      if (isNaN(ram)) {
        spinner.fail("Invalid RAM value. Must be a number.");
        process.exit(1);
      }
      requestBody.ram = ram;
    }

    if (options.disk) {
      const disk = parseInt(options.disk, 10);
      if (isNaN(disk)) {
        spinner.fail("Invalid disk value. Must be a number.");
        process.exit(1);
      }
      requestBody.disk = disk;
    } else {
      requestBody.disk = defaultDisk;
    }

    if (options.gpus) {
      const gpus = parseInt(options.gpus, 10);
      if (isNaN(gpus)) {
        spinner.fail("Invalid GPUs value. Must be a number.");
        process.exit(1);
      }
      requestBody.gpus = gpus;
    }

    if (options.gpuType) requestBody["gpu-type"] = options.gpuType as "5090";

    if (options.startupScript) {
      if (!existsSync(options.startupScript)) {
        spinner.fail(`Startup script file not found: ${options.startupScript}`);
        process.exit(1);
      }

      const stats = statSync(options.startupScript);
      const maxSize = 1048576;
      if (stats.size > maxSize) {
        spinner.fail(
          `Startup script file is too large: ${stats.size} bytes (max: ${maxSize} bytes / 1MB)`,
        );
        process.exit(1);
      }

      try {
        const scriptContent = readFileSync(options.startupScript, "utf-8");
        requestBody.startupScript = scriptContent;
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        spinner.fail(`Failed to read startup script: ${message}`);
        process.exit(1);
      }
    }

    if (options.cloudInit) {
      if (!existsSync(options.cloudInit)) {
        spinner.fail(`Cloud-init config file not found: ${options.cloudInit}`);
        process.exit(1);
      }

      const stats = statSync(options.cloudInit);
      const maxSize = 102400;
      if (stats.size > maxSize) {
        spinner.fail(
          `Cloud-init config file is too large: ${stats.size} bytes (max: ${maxSize} bytes / 100KB)`,
        );
        process.exit(1);
      }

      try {
        const configContent = readFileSync(options.cloudInit, "utf-8");
        if (!configContent.trim().startsWith("#cloud-config")) {
          spinner.fail(
            "Cloud-init config must start with '#cloud-config' header",
          );
          process.exit(1);
        }

        try {
          const parsed = yaml.load(configContent) as Record<string, unknown>;
          const hasPackages =
            !!parsed.packages &&
            Array.isArray(parsed.packages) &&
            parsed.packages.length > 0;
          const hasPackageUpdate = parsed.package_update === true;
          const hasPackageUpgrade = parsed.package_upgrade === true;

          if (hasPackages && !hasPackageUpdate && !hasPackageUpgrade) {
            spinner.warn(
              theme.warning(
                "Warning: Your cloud-init config includes 'packages' but not 'package_update: true' or 'package_upgrade: true'.\n" +
                  "This may cause package installation to fail if apt cache is not updated.\n" +
                  "Consider adding 'package_update: true' to your config.",
              ),
            );
            console.log();
          }
        } catch (yamlError: unknown) {
          const yamlMessage =
            yamlError instanceof Error ? yamlError.message : "Invalid YAML";
          spinner.fail(`Failed to parse cloud-init config: ${yamlMessage}`);
          process.exit(1);
        }

        requestBody.cloudInitConfig = configContent;
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        spinner.fail(`Failed to read cloud-init config: ${message}`);
        process.exit(1);
      }
    }

    let response: Response;
    try {
      response = await fetch(`${BASE_URL}/api/vms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });
    } catch (error: unknown) {
      const statusData = await checkServiceStatus();
      const serviceError = new ServiceUnavailableError(
        statusData?.current.status ?? null,
      );
      spinner.fail(serviceError.message);
      process.exit(1);
    }

    const rawData = (await response.json()) as any;

    if (!response.ok) {
      spinner.fail(
        `Failed to create VM: ${rawData.msg || rawData.error || "Unknown error"}`,
      );
      process.exit(1);
    }

    const data = VMCreationResponseSchema.parse(rawData);

    if (data.status === "success") {
      if (!data.vmId) {
        spinner.fail("VM creation succeeded but no VM ID returned");
        process.exit(1);
      }

      spinner.text = getStatusMessage("pending");
      await pollVMStatus(data.vmId, token, spinner);

      spinner.succeed(theme.success("VM created successfully!"));
      console.log(formatSectionHeader("VM Details"));
      console.log(formatDetail("VM ID", data.vmId));
      if (options.name) console.log(formatDetail("Name", options.name));
      console.log(formatDetail("Duration", `${hours} hour(s)`));
      if (options.cpus) console.log(formatDetail("CPUs", String(options.cpus)));
      if (options.ram) console.log(formatDetail("RAM", `${options.ram} GB`));
      if (options.disk) console.log(formatDetail("Disk", `${options.disk} GB`));
      if (options.gpus) console.log(formatDetail("GPUs", String(options.gpus)));
      if (options.gpuType)
        console.log(formatDetail("GPU Type", options.gpuType));
      console.log();

      const postCreationKeysResult = await getRegisteredKeys(token);
      if (!postCreationKeysResult.success) {
        console.log(theme.error("Failed to check SSH keys. Please try again."));
        console.log(theme.muted(`Error: ${postCreationKeysResult.error}`));
        console.log();
      } else if (postCreationKeysResult.keys.length > 0) {
        console.log(theme.success("SSH access configured"));
        console.log(theme.muted("\nTo connect:"));
        const identifier = options.name || data.vmId || "vm-id";
        console.log(formatCommand(`uva vm ssh ${identifier}`));
        console.log();
      } else {
        console.log(
          theme.warning(
            "No SSH keys configured. Add one to enable SSH access:",
          ),
        );
        console.log(
          formatCommand(
            "uva ssh-key add ~/.ssh/id_ed25519.pub --name 'My Key'",
          ),
        );
        console.log();
      }
    } else {
      spinner.fail(`VM creation failed: ${data.msg}`);
      process.exit(1);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (spinner) {
      spinner.fail(`Error: ${message}`);
    } else {
      console.log(theme.warning(`Error: ${message}`));
    }
    process.exit(1);
  }
}

async function deleteVM(nameOrVmId: string): Promise<void> {
  let spinner = ora("Fetching VMs...").start();
  let spinnerActive = true;

  try {
    const token = loadToken();
    if (!token) {
      spinner.fail("Not authenticated. Please run 'uva login' first.");
      process.exit(1);
    }

    const matchingVMs = await fetchAndFilterVMs(
      nameOrVmId,
      token,
      VM_STATUS_GROUPS.DELETABLE,
    );

    if (matchingVMs.length === 0) {
      spinner.fail(`No deletable VM found with name or ID: ${nameOrVmId}`);
      console.log(theme.muted("\nRun 'uva vm list --all' to see all VMs"));
      console.log(
        theme.muted(
          "Note: Already deleted or expired VMs cannot be deleted again\n",
        ),
      );
      process.exit(1);
    }

    let vmsToDelete: string[];

    if (matchingVMs.length > 1) {
      spinner.stop();
      spinnerActive = false;
      const choices = [
        ...matchingVMs.map((v) => {
          const statusColor =
            statusColors[v.status as keyof typeof statusColors] || theme.muted;
          const nameDisplay = v.name
            ? theme.emphasis(v.name)
            : theme.muted("(unnamed)");
          return {
            name: `${nameDisplay} - ${theme.muted(v.vmId)} ${statusColor(`[${v.status}]`)}`,
            value: v.vmId,
          };
        }),
        {
          name: theme.warning("Delete all matching VMs"),
          value: "__DELETE_ALL__",
        },
      ];

      console.log(
        theme.warning(
          `\nFound ${matchingVMs.length} VMs matching "${nameOrVmId}"\n`,
        ),
      );

      const selection = await select({
        message: "Select a VM to delete:",
        choices,
      });

      vmsToDelete =
        selection === "__DELETE_ALL__"
          ? matchingVMs.map((v) => v.vmId)
          : [selection];
      console.log();
    } else {
      spinner.stop();
      spinnerActive = false;
      vmsToDelete = [matchingVMs[0]!.vmId];
    }

    for (const vmId of vmsToDelete) {
      const deleteSpinner = ora(`Deleting VM ${vmId}...`).start();

      let response: Response;
      try {
        response = await fetch(`${BASE_URL}/api/vms/${vmId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (error: unknown) {
        const statusData = await checkServiceStatus();
        const serviceError = new ServiceUnavailableError(
          statusData?.current.status ?? null,
        );
        deleteSpinner.fail(serviceError.message);
        continue;
      }

      const rawData = (await response.json()) as any;

      if (!response.ok) {
        deleteSpinner.fail(
          `Failed to delete VM ${vmId}: ${rawData.msg || rawData.error || "Unknown error"}`,
        );
        continue;
      }

      const data = VMDeletionResponseSchema.parse(rawData);

      if (data.status === "deletion_success") {
        deleteSpinner.succeed(
          theme.success(`VM ${vmId} deleted successfully!`),
        );
      } else {
        deleteSpinner.fail(`VM deletion failed: ${data.msg}`);
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (spinnerActive && spinner) {
      spinner.fail(`Error: ${message}`);
    } else {
      console.log(theme.warning(`Error: ${message}`));
    }
    process.exit(1);
  }
}

async function getVMStatus(vmId: string): Promise<void> {
  const spinner = ora(`Getting status for VM ${vmId}...`).start();

  try {
    const token = loadToken();
    if (!token) {
      spinner.fail("Not authenticated. Please run 'uva login' first.");
      process.exit(1);
    }

    let response: Response;
    try {
      response = await fetch(`${BASE_URL}/api/vms/${vmId}/status`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    } catch (error: unknown) {
      const statusData = await checkServiceStatus();
      const serviceError = new ServiceUnavailableError(
        statusData?.current.status ?? null,
      );
      spinner.fail(serviceError.message);
      process.exit(1);
    }

    const rawData = (await response.json()) as any;

    if (!response.ok) {
      spinner.fail(
        `Failed to get VM status: ${rawData.msg || rawData.error || "Unknown error"}`,
      );
      process.exit(1);
    }

    const data = VMStatusResponseSchema.parse(rawData);

    spinner.succeed(theme.success("VM status retrieved!"));
    console.log(formatSectionHeader("VM Status"));
    console.log(formatDetail("Status", data.status));
    console.log(formatDetail("Message", data.msg));
    if (data.info) {
      console.log(formatDetail("Info", JSON.stringify(data.info, null, 2)));
    }
    console.log();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    spinner.fail(`Error: ${message}`);
    process.exit(1);
  }
}

async function listVMs(options: { all?: boolean }): Promise<void> {
  const spinner = ora("Fetching VMs...").start();

  try {
    const token = loadToken();
    if (!token) {
      spinner.fail("Not authenticated. Please run 'uva login' first.");
      process.exit(1);
    }

    let response: Response;
    try {
      response = await fetch(`${BASE_URL}/api/vms`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    } catch (error: unknown) {
      const statusData = await checkServiceStatus();
      const serviceError = new ServiceUnavailableError(
        statusData?.current.status ?? null,
      );
      spinner.fail(serviceError.message);
      process.exit(1);
    }

    const rawData = (await response.json()) as any;

    if (!response.ok) {
      spinner.fail(`Failed to fetch VMs: ${rawData.error || "Unknown error"}`);
      process.exit(1);
    }

    const data = VMListResponseSchema.parse(rawData);

    const allVMs = options.all ? data.vms : data.vms;

    spinner.succeed(theme.success("VMs retrieved!"));

    if (allVMs.length === 0) {
      console.log(theme.warning("\nNo VMs found."));
      console.log(theme.muted("Create one with: uva vm create -h 1 -n myvm\n"));
      return;
    }

    const sorted = [...allVMs].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    console.log();
    const headers = ["Age", "VM", "Resources", "Status"];
    const rows = sorted.map((vm) => {
      const nameDisplay = vm.name ? vm.name : "(unnamed)";
      const vmLabel = `${nameDisplay} ${theme.muted(vm.vmId)}`;
      return [
        formatAge(new Date(vm.createdAt)),
        vmLabel,
        formatResources(vm),
        formatStatus(vm.status),
      ];
    });

    const widths = headers.map((header, index) => {
      const cellWidths = rows.map((row) => stripAnsi(row[index] ?? "").length);
      return Math.max(header.length, ...cellWidths);
    });

    const renderRow = (cols: string[]) =>
      cols
        .map((col, index) => {
          const padding = (widths[index] ?? 0) - stripAnsi(col).length;
          return `${col}${" ".repeat(Math.max(0, padding + 2))}`;
        })
        .join("")
        .trimEnd();

    console.log(renderRow(headers.map((h) => theme.muted(h))));
    for (const row of rows) {
      console.log(renderRow(row));
    }
    console.log();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    spinner.fail(`Error: ${message}`);
    process.exit(1);
  }
}

interface ConnectionInfo {
  vmId: string;
  name: string | null;
  status: string;
  proxy: {
    host: string;
    port: number;
    user: string;
  };
  token: string;
}

async function ensureProxyKey(): Promise<string> {
  const uvaDir = join(homedir(), ".uva");
  const keyPath = join(uvaDir, "vmproxy-key");

  if (!existsSync(keyPath)) {
    // Download the key from the site
    const response = await fetch(`${BASE_URL}/api/vmproxy-key`);
    if (!response.ok) {
      throw new Error("Failed to download proxy key");
    }
    const keyContent = await response.text();

    // Ensure directory exists
    if (!existsSync(uvaDir)) {
      mkdirSync(uvaDir, { recursive: true });
    }

    // Write key with proper permissions
    writeFileSync(keyPath, keyContent, { mode: 0o600 });
  }

  return keyPath;
}

async function sshToVM(nameOrVmId: string): Promise<void> {
  let spinner = ora("Checking prerequisites...").start();

  try {
    const token = loadToken();
    if (!token) {
      spinner.fail("Not authenticated. Please run 'uva login' first.");
      process.exit(1);
    }

    spinner.text = "Fetching VMs...";

    const matchingVMs = await fetchAndFilterVMs(
      nameOrVmId,
      token,
      VM_STATUS_GROUPS.READY,
    );

    if (matchingVMs.length === 0) {
      spinner.fail(`No running VM found with name or ID: ${nameOrVmId}`);
      console.log(theme.muted("\nRun 'uva vm list --all' to see all VMs"));
      console.log(
        theme.muted("Note: Only running VMs can be accessed via SSH\n"),
      );
      process.exit(1);
    }

    let vm;

    if (matchingVMs.length > 1) {
      spinner.stop();
      vm = await selectVM(matchingVMs, nameOrVmId);
      console.log();
      spinner = ora("Checking SSH keys...").start();
    } else {
      vm = matchingVMs[0];
      spinner.text = "Checking SSH keys...";
    }

    if (vm.status !== "ready") {
      spinner.fail(`VM is not ready (current status: ${vm.status})`);
      process.exit(1);
    }

    const sshKeysResult = await getRegisteredKeys(token);
    if (!sshKeysResult.success) {
      spinner.fail("Failed to check SSH keys. Please try again.");
      console.log(theme.muted(`Error: ${sshKeysResult.error}`));
      process.exit(1);
    }

    if (sshKeysResult.keys.length === 0) {
      spinner.stop();
      console.log(
        theme.warning("\nNo SSH keys configured. Cannot connect to VM."),
      );
      const configured = await ensureSSHKeysConfigured(token);
      if (!configured) {
        process.exit(1);
      }
      console.log(
        theme.muted(
          "Note: The VM was created before this key was added. SSH may not work.",
        ),
      );
      console.log(
        theme.muted("You may need to create a new VM for SSH access to work."),
      );
      console.log();
      spinner.start("Connecting to VM...");
    }

    spinner.text = "Getting connection info...";

    const connectionResponse = await fetch(
      `${BASE_URL}/api/vms/${vm.vmId}/connection`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!connectionResponse.ok) {
      const errorData = (await connectionResponse.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };
      spinner.fail(
        `Failed to get connection info: ${errorData.message || errorData.error || "Unknown error"}`,
      );
      process.exit(1);
    }

    const connectionInfo = (await connectionResponse.json()) as ConnectionInfo;

    if (!connectionInfo.proxy) {
      spinner.fail("Failed to get proxy connection info. Please try again.");
      process.exit(1);
    }

    spinner.text = "Setting up secure connection...";
    const proxyKeyPath = await ensureProxyKey();

    spinner.succeed(theme.success("Connecting to VM..."));

    console.log(formatSectionHeader("SSH Session"));
    console.log();

    const { host, port, user } = connectionInfo.proxy;
    const accessToken = connectionInfo.token;
    // SSH to the VM through the hub's proxy service
    // The proxy validates the token and runs virtctl to connect to the VM
    const proxyCommand = `ssh -i ${proxyKeyPath} -p ${port} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null ${user}@${host} ${accessToken}`;

    const uvaKeyPath = join(homedir(), ".ssh", "id_ed25519_uvacompute");
    const sshArgs = [
      ...(existsSync(uvaKeyPath)
        ? ["-i", uvaKeyPath, "-o", "IdentitiesOnly=yes"]
        : []),
      "-o",
      `ProxyCommand=${proxyCommand}`,
      "-o",
      "StrictHostKeyChecking=no",
      "-o",
      "UserKnownHostsFile=/dev/null",
      `root@${vm.vmId}`,
    ];

    const sshProcess = spawn("ssh", sshArgs, {
      stdio: "inherit",
    });

    sshProcess.on("exit", (code) => {
      if (code !== 0) {
        console.log(theme.warning(`\nSSH process exited with code ${code}`));
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    spinner.fail(`Error: ${message}`);
    process.exit(1);
  }
}

export function registerVMCommands(program: Command) {
  const vm = program.command("vm").description("Manage virtual machines");

  vm.command("create")
    .description("Create a new VM")
    .requiredOption("-h, --hours <hours>", "Number of hours to run the VM")
    .option("-c, --cpus <cpus>", "Number of CPUs (default: 1)")
    .option("-r, --ram <ram>", "RAM in GB (default: 8)")
    .option("-d, --disk <disk>", "Disk size in GB (default: 64)")
    .option("-g, --gpus <gpus>", "Number of GPUs (default: 0)")
    .option("-t, --gpu-type <type>", "GPU type (default: 5090)")
    .option("-n, --name <name>", "VM name (optional)")
    .option(
      "-s, --startup-script <path>",
      "Path to startup script (runs on first boot)",
    )
    .option(
      "--cloud-init <path>",
      "Path to cloud-init config file (mutually exclusive with --startup-script)",
    )
    .action(createVM);

  vm.command("delete")
    .alias("rm")
    .description("Delete a VM")
    .argument("<nameOrVmId>", "VM name or VM ID")
    .action(deleteVM);

  vm.command("status")
    .description("Get VM status")
    .argument("<vmId>", "VM ID to check")
    .action(getVMStatus);

  vm.command("list")
    .alias("ls")
    .description("List running VMs")
    .option("-a, --all", "Show all VMs (including non-running)")
    .action(listVMs);

  vm.command("ssh")
    .description("Connect to VM via SSH")
    .argument("<nameOrVmId>", "VM name or VM ID")
    .action(sshToVM);
}
