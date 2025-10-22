import type { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import { loadToken, getBaseUrl } from "./lib/utils";
import { UserResponseSchema } from "./lib/schemas";

const BASE_URL = getBaseUrl();

async function whoami(): Promise<void> {
  const spinner = ora("Fetching user information...").start();

  try {
    const token = loadToken();
    if (!token) {
      spinner.fail("Not authenticated. Please run 'uva login' first.");
      process.exit(1);
    }

    const response = await fetch(`${BASE_URL}/api/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const rawData = await response.json();

    if (!response.ok) {
      const errorMessage =
        (rawData as any)?.error || response.statusText || "Unknown error";
      spinner.fail(`Failed to fetch user: ${errorMessage}`);
      process.exit(1);
    }

    const data = UserResponseSchema.parse(rawData);

    spinner.succeed(chalk.green("User information retrieved!"));

    console.log(chalk.blue("\nYour Profile:"));
    console.log(chalk.gray(`- Name: ${data.user.name}`));
    console.log(chalk.gray(`- Email: ${data.user.email}`));
    console.log(
      chalk.gray(`- Email Verified: ${data.user.emailVerified ? "Yes" : "No"}`),
    );
    if (data.user.image) {
      console.log(chalk.gray(`- Profile Image: ${data.user.image}`));
    }
    console.log(
      chalk.gray(
        `- Member Since: ${new Date(data.user.createdAt).toLocaleDateString()}`,
      ),
    );
    console.log();
  } catch (error: any) {
    spinner.fail(`Error: ${error.message}`);
    process.exit(1);
  }
}

export function registerUserCommands(program: Command) {
  program
    .command("whoami")
    .description("Display current user information")
    .action(whoami);
}
