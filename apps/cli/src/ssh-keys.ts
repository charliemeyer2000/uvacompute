import type { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import { readFileSync, existsSync } from "fs";
import { getBaseUrl, loadToken } from "./lib/utils";
import {
  SSHKeyListResponseSchema,
  SSHKeyAddResponseSchema,
} from "./lib/schemas";

const BASE_URL = getBaseUrl();

async function addSSHKey(
  keyPath: string,
  options: { name?: string },
): Promise<void> {
  const spinner = ora("Adding SSH key...").start();

  try {
    const token = loadToken();
    if (!token) {
      spinner.fail("Not authenticated. Please run 'uva login' first.");
      process.exit(1);
    }

    if (!existsSync(keyPath)) {
      spinner.fail(`SSH key file not found: ${keyPath}`);
      process.exit(1);
    }

    const publicKey = readFileSync(keyPath, "utf-8").trim();

    if (!publicKey) {
      spinner.fail("SSH key file is empty");
      process.exit(1);
    }

    const response = await fetch(`${BASE_URL}/api/ssh-keys`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        publicKey,
        name: options.name || "Unnamed Key",
      }),
    });

    const rawData = await response.json();

    if (!response.ok) {
      spinner.fail(
        `Failed to add SSH key: ${rawData.error || "Unknown error"}`,
      );
      process.exit(1);
    }

    const data = SSHKeyAddResponseSchema.parse(rawData);

    spinner.succeed(chalk.green("SSH key added successfully!"));
    console.log(chalk.blue("\nKey Details:"));
    console.log(chalk.gray(`- Name: ${data.name}`));
    console.log(chalk.gray(`- Fingerprint: ${data.fingerprint}`));
    console.log(chalk.gray(`- Key Type: ${data.keyType}`));
    console.log();
  } catch (error: any) {
    spinner.fail(`Error: ${error.message}`);
    process.exit(1);
  }
}

async function listSSHKeys(): Promise<void> {
  const spinner = ora("Fetching SSH keys...").start();

  try {
    const token = loadToken();
    if (!token) {
      spinner.fail("Not authenticated. Please run 'uva login' first.");
      process.exit(1);
    }

    const response = await fetch(`${BASE_URL}/api/ssh-keys`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const rawData = await response.json();

    if (!response.ok) {
      spinner.fail(
        `Failed to fetch SSH keys: ${rawData.error || "Unknown error"}`,
      );
      process.exit(1);
    }

    const data = SSHKeyListResponseSchema.parse(rawData);

    spinner.succeed(chalk.green("SSH keys retrieved!"));

    if (data.keys.length === 0) {
      console.log(chalk.yellow("\nNo SSH keys found."));
      console.log(
        chalk.gray("Add a key with: uva ssh-key add ~/.ssh/id_rsa.pub\n"),
      );
      return;
    }

    console.log(chalk.blue("\nYour SSH Keys:"));
    console.log();

    for (const key of data.keys) {
      const primaryLabel = key.isPrimary ? chalk.green(" [PRIMARY]") : "";
      console.log(chalk.bold(`${key.name}${primaryLabel}`));
      console.log(chalk.gray(`  ID: ${key._id}`));
      console.log(chalk.gray(`  Fingerprint: ${key.fingerprint}`));
      console.log(
        chalk.gray(
          `  Created: ${new Date(key.createdAt).toLocaleDateString()}`,
        ),
      );
      console.log();
    }
  } catch (error: any) {
    spinner.fail(`Error: ${error.message}`);
    process.exit(1);
  }
}

async function removeSSHKey(keyId: string): Promise<void> {
  const spinner = ora(`Removing SSH key ${keyId}...`).start();

  try {
    const token = loadToken();
    if (!token) {
      spinner.fail("Not authenticated. Please run 'uva login' first.");
      process.exit(1);
    }

    const response = await fetch(`${BASE_URL}/api/ssh-keys/${keyId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const rawData = await response.json();

    if (!response.ok) {
      spinner.fail(
        `Failed to remove SSH key: ${rawData.error || "Unknown error"}`,
      );
      process.exit(1);
    }

    spinner.succeed(chalk.green(`SSH key ${keyId} removed successfully!`));
  } catch (error: any) {
    spinner.fail(`Error: ${error.message}`);
    process.exit(1);
  }
}

async function setPrimaryKey(keyId: string): Promise<void> {
  const spinner = ora(`Setting SSH key ${keyId} as primary...`).start();

  try {
    const token = loadToken();
    if (!token) {
      spinner.fail("Not authenticated. Please run 'uva login' first.");
      process.exit(1);
    }

    const response = await fetch(`${BASE_URL}/api/ssh-keys/${keyId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ isPrimary: true }),
    });

    const rawData = await response.json();

    if (!response.ok) {
      spinner.fail(
        `Failed to set primary key: ${rawData.error || "Unknown error"}`,
      );
      process.exit(1);
    }

    spinner.succeed(chalk.green(`SSH key ${keyId} set as primary!`));
  } catch (error: any) {
    spinner.fail(`Error: ${error.message}`);
    process.exit(1);
  }
}

export function registerSSHKeyCommands(program: Command) {
  const sshKey = program
    .command("ssh-key")
    .description("Manage SSH keys for VM access");

  sshKey
    .command("add")
    .description("Add a new SSH public key")
    .argument("<path>", "Path to SSH public key file")
    .option("-n, --name <name>", "Friendly name for the key")
    .action(addSSHKey);

  sshKey.command("list").description("List all SSH keys").action(listSSHKeys);

  sshKey
    .command("remove")
    .description("Remove an SSH key")
    .argument("<keyId>", "SSH key ID to remove")
    .action(removeSSHKey);

  sshKey
    .command("set-primary")
    .description("Set an SSH key as primary")
    .argument("<keyId>", "SSH key ID to set as primary")
    .action(setPrimaryKey);
}
