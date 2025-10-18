import type { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import { getBaseUrl, loadToken } from "./lib/utils";
import {
  type VMCreationRequest,
  type VMCreationResponse,
  type VMDeletionResponse,
  type VMStatusResponse,
} from "./lib/types";
import {
  VMCreationRequestSchema,
  VMCreationResponseSchema,
  VMDeletionResponseSchema,
  VMStatusResponseSchema,
} from "./lib/schemas";

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
      console.log(chalk.gray(`- Duration: ${hours} hour(s)`));
      if (options.cpus) console.log(chalk.gray(`- CPUs: ${options.cpus}`));
      if (options.ram) console.log(chalk.gray(`- RAM: ${options.ram} GB`));
      if (options.disk) console.log(chalk.gray(`- Disk: ${options.disk} GB`));
      if (options.gpus) console.log(chalk.gray(`- GPUs: ${options.gpus}`));
      if (options.gpuType)
        console.log(chalk.gray(`- GPU Type: ${options.gpuType}`));
      console.log();
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
}
