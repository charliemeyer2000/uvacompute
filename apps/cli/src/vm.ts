import type { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import { spawn } from "child_process";
import { getBaseUrl, loadToken } from "./lib/utils";
import {
  type VMCreationRequest,
  type VMCreationResponse,
  type VMDeletionResponse,
  type VMStatusResponse,
  type VMListResponse,
  type VMConnectionInfo,
} from "./lib/types";
import {
  VMCreationRequestSchema,
  VMCreationResponseSchema,
  VMDeletionResponseSchema,
  VMStatusResponseSchema,
  VMListResponseSchema,
  VMConnectionInfoSchema,
  SSHKeyListResponseSchema,
} from "./lib/schemas";
import { updateSSHConfig } from "./lib/ssh-config";

const BASE_URL = getBaseUrl();

async function createVM(options: {
  hours: string;
  cpus?: string;
  ram?: string;
  disk?: string;
  gpus?: string;
  gpuType?: string;
  name?: string;
}): Promise<void> {
  const spinner = ora("Creating VM...").start();

  try {
    const token = loadToken();
    if (!token) {
      spinner.fail("Not authenticated. Please run 'uva login' first.");
      process.exit(1);
    }

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
      spinner.succeed(chalk.green("VM created successfully!"));
      console.log(chalk.blue("\nVM Details:"));
      console.log(chalk.gray(`- VM ID: ${data.vmId}`));
      if (options.name) console.log(chalk.gray(`- Name: ${options.name}`));
      console.log(chalk.gray(`- Duration: ${hours} hour(s)`));
      if (options.cpus) console.log(chalk.gray(`- CPUs: ${options.cpus}`));
      if (options.ram) console.log(chalk.gray(`- RAM: ${options.ram} GB`));
      if (options.disk) console.log(chalk.gray(`- Disk: ${options.disk} GB`));
      if (options.gpus) console.log(chalk.gray(`- GPUs: ${options.gpus}`));
      if (options.gpuType)
        console.log(chalk.gray(`- GPU Type: ${options.gpuType}`));
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
            chalk.yellow(
              "No SSH keys configured. Add one to enable SSH access:",
            ),
          );
          console.log(
            chalk.gray(
              "  uva ssh-key add ~/.ssh/id_rsa.pub --name 'Some Key Name'",
            ),
          );
          console.log();
        } else {
          console.log(chalk.green("SSH access configured"));
          console.log(chalk.gray("\nTo connect:"));
          const identifier = options.name || data.vmId;
          console.log(chalk.cyan(`  uva vm ssh ${identifier}`));
          console.log();
        }
      }
    } else {
      spinner.fail(`VM creation failed: ${data.msg}`);
      process.exit(1);
    }
  } catch (error: any) {
    spinner.fail(`Error: ${error.message}`);
    process.exit(1);
  }
}

async function deleteVM(vmId: string): Promise<void> {
  const spinner = ora(`Deleting VM ${vmId}...`).start();

  try {
    const token = loadToken();
    if (!token) {
      spinner.fail("Not authenticated. Please run 'uva login' first.");
      process.exit(1);
    }

    const response = await fetch(`${BASE_URL}/api/vms/${vmId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const rawData = (await response.json()) as any;

    if (!response.ok) {
      spinner.fail(
        `Failed to delete VM: ${rawData.msg || rawData.error || "Unknown error"}`,
      );
      process.exit(1);
    }

    const data = VMDeletionResponseSchema.parse(rawData);

    if (data.status === "deletion_success") {
      spinner.succeed(chalk.green(`VM ${vmId} deleted successfully!`));
    } else {
      spinner.fail(`VM deletion failed: ${data.msg}`);
      process.exit(1);
    }
  } catch (error: any) {
    spinner.fail(`Error: ${error.message}`);
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

    const response = await fetch(`${BASE_URL}/api/vms/${vmId}`, {
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

    spinner.succeed(chalk.green("VM status retrieved!"));
    console.log(chalk.blue("\nVM Status:"));
    console.log(chalk.gray(`- Status: ${data.status}`));
    console.log(chalk.gray(`- Message: ${data.msg}`));
    if (data.info) {
      console.log(chalk.gray(`- Info: ${JSON.stringify(data.info, null, 2)}`));
    }
    console.log();
  } catch (error: any) {
    spinner.fail(`Error: ${error.message}`);
    process.exit(1);
  }
}

async function listVMs(): Promise<void> {
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

    spinner.succeed(chalk.green("VMs retrieved!"));

    if (data.vms.length === 0) {
      console.log(chalk.yellow("\nNo VMs found."));
      console.log(chalk.gray("Create one with: uva vm create -h 1 -n myvm\n"));
      return;
    }

    console.log(chalk.blue("\nYour VMs:"));
    console.log();

    for (const vm of data.vms) {
      const statusColor =
        vm.status === "running"
          ? chalk.green
          : vm.status === "creating"
            ? chalk.yellow
            : chalk.red;

      const nameDisplay = vm.name
        ? chalk.bold(vm.name)
        : chalk.gray("(unnamed)");
      console.log(`${nameDisplay} ${statusColor(`[${vm.status}]`)}`);
      console.log(chalk.gray(`  VM ID: ${vm.vmId}`));
      console.log(
        chalk.gray(
          `  Resources: ${vm.cpus} vCPU | ${vm.ram}GB RAM | ${vm.disk}GB disk${vm.gpus > 0 ? ` | ${vm.gpus}x ${vm.gpuType}` : ""}`,
        ),
      );
      console.log(
        chalk.gray(`  Created: ${new Date(vm.createdAt).toLocaleString()}`),
      );
      console.log(
        chalk.gray(`  Expires: ${new Date(vm.expiresAt).toLocaleString()}`),
      );
      console.log();
    }
  } catch (error: any) {
    spinner.fail(`Error: ${error.message}`);
    process.exit(1);
  }
}

async function sshToVM(
  nameOrVmId: string,
  options: { setupOnly?: boolean },
): Promise<void> {
  const spinner = ora("Fetching VM connection info...").start();

  try {
    const token = loadToken();
    if (!token) {
      spinner.fail("Not authenticated. Please run 'uva login' first.");
      process.exit(1);
    }

    const vmsResponse = await fetch(`${BASE_URL}/api/vms`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!vmsResponse.ok) {
      spinner.fail("Failed to fetch VMs");
      process.exit(1);
    }

    const vmsData = VMListResponseSchema.parse(await vmsResponse.json());
    const vm = vmsData.vms.find(
      (v) => v.vmId === nameOrVmId || v.name === nameOrVmId,
    );

    if (!vm) {
      spinner.fail(`VM not found: ${nameOrVmId}`);
      console.log(chalk.gray("\nRun 'uva vm list' to see all VMs\n"));
      process.exit(1);
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
          console.log(chalk.yellow(errorData.message));
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
        spinner.warn(chalk.yellow("No SSH keys configured"));
        console.log(
          chalk.gray(
            "\nAdd an SSH key to enable access:\n  uva ssh-key add ~/.ssh/id_rsa.pub --name 'My Key'\n",
          ),
        );
        process.exit(1);
      }
    }

    spinner.succeed(chalk.green("VM connection info retrieved!"));

    const hostAlias = vm.name || vm.vmId;

    updateSSHConfig(hostAlias, {
      hostName: connectionInfo.sshHost,
      user: `${connectionInfo.user}@${vm.vmId}`,
      port: connectionInfo.sshPort,
      strictHostKeyChecking: "no",
      userKnownHostsFile: "/dev/null",
    });

    console.log(chalk.green(`\nSSH config updated for '${hostAlias}'`));
    console.log(chalk.gray(`  Added to ~/.ssh/config`));
    console.log(chalk.gray(`  Backup saved to ~/.ssh/config.backup`));
    console.log();

    if (options.setupOnly) {
      console.log(chalk.blue("Setup complete! Connect with:"));
      console.log(chalk.cyan(`  ssh ${hostAlias}`));
      console.log();
      return;
    }

    console.log(chalk.blue("Connecting..."));
    console.log();

    const sshProcess = spawn("ssh", [hostAlias], {
      stdio: "inherit",
    });

    sshProcess.on("exit", (code) => {
      if (code !== 0) {
        console.log(chalk.yellow(`\nSSH process exited with code ${code}`));
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
    .argument("<vmId>", "VM ID to delete")
    .action(deleteVM);

  vm.command("rm")
    .description("Delete a VM (alias for delete)")
    .argument("<vmId>", "VM ID to delete")
    .action(deleteVM);

  vm.command("status")
    .description("Get VM status")
    .argument("<vmId>", "VM ID to check")
    .action(getVMStatus);

  vm.command("list").description("List all VMs").action(listVMs);

  vm.command("ssh")
    .description("Setup SSH config and connect to VM")
    .argument("<nameOrVmId>", "VM name or VM ID")
    .option("--setup-only", "Only setup SSH config without connecting")
    .action(sshToVM);
}
