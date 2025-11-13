import type { Command } from "commander";
import ora from "ora";
import { spawn } from "child_process";
import { select, confirm } from "@inquirer/prompts";
import { getBaseUrl, loadToken } from "./lib/utils";
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
  VMConnectionInfoSchema,
  SSHKeyListResponseSchema,
  VM_STATUS_GROUPS,
} from "./lib/schemas";
import {
  VMError,
  VMOperationError,
  VMValidationError,
  VMNetworkError,
  shouldStopRetrying,
  isTransientError,
  parseErrorResponse,
} from "./lib/errors";
const BASE_URL = getBaseUrl();

function getStatusMessage(status: string): string {
  const messages: Record<string, string> = {
    not_found: "VM not found",
    creating: "Creating VM...",
    initializing: "Initializing VM instance...",
    starting: "Starting VM...",
    waiting_for_agent: "Waiting for VM agent...",
    configuring: "Configuring VM (running cloud-init)...",
    running: "VM is running!",
    failed: "VM creation failed",
    deleting: "Deleting VM...",
    deleted: "VM deleted",
    expired: "VM expired",
    updating: "Updating VM...",
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
  spinner: any,
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

        if (statusData.status === "running") {
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
}): Promise<void> {
  let spinner: any = null;

  try {
    const token = loadToken();
    if (!token) {
      console.log(
        theme.warning("Not authenticated. Please run 'uva login' first."),
      );
      process.exit(1);
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

    // Make API request to Next.js backend
    const response = await fetch(`${BASE_URL}/api/vms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    });

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

      spinner.text = getStatusMessage("creating");
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

      const keysResponse = await fetch(`${BASE_URL}/api/ssh-keys`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (keysResponse.ok) {
        const keysData = SSHKeyListResponseSchema.parse(
          await keysResponse.json(),
        );

        if (keysData.keys.length === 0) {
          console.log(
            theme.warning(
              "No SSH keys configured. Add one to enable SSH access:",
            ),
          );
          console.log(
            formatCommand(
              "uva ssh-key add ~/.ssh/id_ed25519.pub --name 'Some Key Name'",
            ),
          );
          console.log();
        } else {
          console.log(theme.success("SSH access configured"));
          console.log(theme.muted("\nTo connect:"));
          const identifier = options.name || data.vmId || "vm-id";
          console.log(formatCommand(`uva vm ssh ${identifier}`));
          console.log();
        }
      }
    } else {
      spinner.fail(`VM creation failed: ${data.msg}`);
      process.exit(1);
    }
  } catch (error: any) {
    if (spinner) {
      spinner.fail(`Error: ${error.message}`);
    } else {
      console.log(theme.warning(`Error: ${error.message}`));
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
      vmsToDelete = [matchingVMs[0]!.vmId];
    }

    for (const vmId of vmsToDelete) {
      const deleteSpinner = ora(`Deleting VM ${vmId}...`).start();

      const response = await fetch(`${BASE_URL}/api/vms/${vmId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

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
  } catch (error: any) {
    if (spinnerActive && spinner) {
      spinner.fail(`Error: ${error.message}`);
    } else {
      console.log(theme.warning(`Error: ${error.message}`));
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

    const response = await fetch(`${BASE_URL}/api/vms/${vmId}/status`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

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
  } catch (error: any) {
    spinner.fail(`Error: ${error.message}`);
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

    const response = await fetch(`${BASE_URL}/api/vms`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const rawData = (await response.json()) as any;

    if (!response.ok) {
      spinner.fail(`Failed to fetch VMs: ${rawData.error || "Unknown error"}`);
      process.exit(1);
    }

    const data = VMListResponseSchema.parse(rawData);

    const filteredVMs = options.all
      ? data.vms
      : data.vms.filter((vm) => vm.status === "running");

    spinner.succeed(theme.success("VMs retrieved!"));

    if (filteredVMs.length === 0) {
      if (options.all) {
        console.log(theme.warning("\nNo VMs found."));
        console.log(
          theme.muted("Create one with: uva vm create -h 1 -n myvm\n"),
        );
      } else {
        console.log(theme.warning("\nNo running VMs found."));
        console.log(theme.muted("Use 'uva vm list --all' to see all VMs\n"));
      }
      return;
    }

    if (options.all) {
      console.log(formatSectionHeader("All VMs"));
    } else {
      console.log(formatSectionHeader("Running VMs"));
    }
    console.log();

    for (const vm of filteredVMs) {
      const statusColor =
        statusColors[vm.status as keyof typeof statusColors] || theme.muted;

      const nameDisplay = vm.name
        ? theme.emphasis(vm.name)
        : theme.muted("(unnamed)");
      console.log(`${nameDisplay} ${statusColor(`[${vm.status}]`)}`);
      console.log(theme.muted(`  VM ID: ${vm.vmId}`));
      console.log(
        theme.muted(
          `  Resources: ${vm.cpus} vCPU | ${vm.ram}GB RAM | ${vm.disk}GB disk${vm.gpus > 0 ? ` | ${vm.gpus}x ${vm.gpuType}` : ""}`,
        ),
      );
      console.log(
        theme.muted(`  Created: ${new Date(vm.createdAt).toLocaleString()}`),
      );
      console.log(
        theme.muted(`  Expires: ${new Date(vm.expiresAt).toLocaleString()}`),
      );
      console.log();
    }
  } catch (error: any) {
    spinner.fail(`Error: ${error.message}`);
    process.exit(1);
  }
}

async function sshToVM(nameOrVmId: string): Promise<void> {
  let spinner = ora("Fetching VMs...").start();

  try {
    const token = loadToken();
    if (!token) {
      spinner.fail("Not authenticated. Please run 'uva login' first.");
      process.exit(1);
    }

    const matchingVMs = await fetchAndFilterVMs(
      nameOrVmId,
      token,
      VM_STATUS_GROUPS.RUNNING,
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
      spinner = ora("Fetching VM connection info...").start();
    } else {
      vm = matchingVMs[0];
      spinner.text = "Fetching VM connection info...";
    }

    if (vm.status !== "running") {
      spinner.fail(`VM is not running (current status: ${vm.status})`);
      process.exit(1);
    }

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
      const errorData = (await connectionResponse.json()) as {
        error?: string;
        message?: string;
        status?: string;
      };
      if (connectionResponse.status === 409 && errorData.status) {
        spinner.fail(`VM is not running (current status: ${errorData.status})`);
        if (errorData.message) {
          console.log(theme.warning(errorData.message));
        }
      } else {
        spinner.fail(
          errorData.error ||
            errorData.message ||
            "Failed to fetch connection info",
        );
      }
      process.exit(1);
    }

    const connectionInfo = VMConnectionInfoSchema.parse(
      await connectionResponse.json(),
    );

    const keysResponse = await fetch(`${BASE_URL}/api/ssh-keys`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (keysResponse.ok) {
      const keysData = SSHKeyListResponseSchema.parse(
        await keysResponse.json(),
      );

      if (keysData.keys.length === 0) {
        spinner.warn(theme.warning("No SSH keys configured"));
        console.log(theme.muted("\nAdd an SSH key to enable access:"));
        console.log(
          formatCommand(
            "uva ssh-key add ~/.ssh/id_ed25519.pub --name 'My Key'",
          ),
        );
        console.log();
        process.exit(1);
      }
    }

    spinner.succeed(theme.success("VM connection info retrieved!"));

    console.log(formatSectionHeader("Connecting to VM"));
    console.log();

    const sshArgs = [
      "-p",
      connectionInfo.sshPort.toString(),
      "-o",
      "StrictHostKeyChecking=no",
      "-o",
      "UserKnownHostsFile=/dev/null",
      `${connectionInfo.user}@${vm.vmId}@${connectionInfo.sshHost}`,
    ];

    const sshProcess = spawn("ssh", sshArgs, {
      stdio: "inherit",
    });

    sshProcess.on("exit", (code) => {
      if (code !== 0) {
        console.log(theme.warning(`\nSSH process exited with code ${code}`));
      }
    });
  } catch (error: any) {
    spinner.fail(`Error: ${error.message}`);
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
    .action(createVM);

  vm.command("delete")
    .description("Delete a VM")
    .argument("<nameOrVmId>", "VM name or VM ID")
    .action(deleteVM);

  vm.command("rm")
    .description("Delete a VM (alias for delete)")
    .argument("<nameOrVmId>", "VM name or VM ID")
    .action(deleteVM);

  vm.command("status")
    .description("Get VM status")
    .argument("<vmId>", "VM ID to check")
    .action(getVMStatus);

  vm.command("list")
    .description("List running VMs")
    .option("-a, --all", "Show all VMs (including non-running)")
    .action(listVMs);

  vm.command("ls")
    .description("List running VMs (alias for list)")
    .option("-a, --all", "Show all VMs (including non-running)")
    .action(listVMs);

  vm.command("ssh")
    .description("Connect to VM via SSH")
    .argument("<nameOrVmId>", "VM name or VM ID")
    .action(sshToVM);
}
