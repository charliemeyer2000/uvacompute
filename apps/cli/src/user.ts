import type { Command } from "commander";
import ora from "ora";
import { loadToken, getBaseUrl } from "./lib/utils";
import { UserResponseSchema } from "./lib/schemas";
import { theme } from "./lib/theme";

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

    spinner.succeed(theme.success("User information retrieved!"));

    console.log(
      `You're logged in as ${theme.emphasis(data.user.name)} with email ${theme.emphasis(data.user.email)}`,
    );
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
