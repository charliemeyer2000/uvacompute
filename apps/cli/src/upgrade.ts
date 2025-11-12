import type { Command } from "commander";
import ora from "ora";
import { confirm } from "@inquirer/prompts";
import { theme } from "./lib/theme";
import chalk from "chalk";
import { getBaseUrl, compareVersions, findBinaryPath } from "./lib/utils";
import { VersionResponseSchema } from "./lib/schemas";
import { PROD_SITE_URL } from "./lib/constants";

const CURRENT_VERSION = require("../package.json").version;

async function upgrade(): Promise<void> {
  const spinner = ora("Checking for updates...").start();

  try {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/cli/version`, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      spinner.fail(theme.error("Failed to check for updates"));
      console.log(chalk.gray("\nPlease try again later."));
      process.exit(1);
    }

    const rawData = await response.json();
    const data = VersionResponseSchema.parse(rawData);
    const latestVersion = data.version;

    if (!compareVersions(CURRENT_VERSION, latestVersion)) {
      spinner.succeed(
        theme.success("You're already on the latest version!") +
          " " +
          chalk.gray(`(${CURRENT_VERSION})`),
      );
      process.exit(0);
    }

    spinner.succeed(
      theme.emphasis("Update available:") +
        " " +
        theme.muted(`${CURRENT_VERSION}`) +
        " → " +
        theme.success(`${latestVersion}`),
    );

    console.log();
    const shouldUpgrade = await confirm({
      message: "Would you like to upgrade now?",
      default: true,
    });

    if (!shouldUpgrade) {
      console.log(chalk.gray("\nUpgrade cancelled."));
      process.exit(0);
    }

    console.log();
    const binaryPath = await findBinaryPath();

    if (!binaryPath) {
      console.log(
        theme.error("Could not find CLI binary location.") +
          "\n\n" +
          "Please upgrade manually:\n" +
          theme.accent(`curl -fsSL ${PROD_SITE_URL}/install.sh | bash`),
      );
      process.exit(1);
    }

    const upgradeSpinner = ora("Downloading and installing update...").start();

    try {
      const installUrl = `${baseUrl}/install.sh`;

      const installProc = Bun.spawn(
        ["bash", "-c", `curl -fsSL ${installUrl} | bash`],
        {
          stdout: "pipe",
          stderr: "pipe",
        },
      );

      await installProc.exited;

      if (installProc.exitCode === 0) {
        upgradeSpinner.succeed(
          theme.success(`Successfully upgraded to v${latestVersion}!`),
        );
        console.log(
          chalk.gray("\nRestart your terminal or run ") +
            theme.accent("source ~/.bashrc") +
            chalk.gray(" (or ") +
            theme.accent("source ~/.zshrc") +
            chalk.gray(") to use the new version."),
        );
      } else {
        const errorOutput = await new Response(installProc.stderr).text();

        if (
          errorOutput.includes("Permission denied") ||
          errorOutput.includes("EACCES")
        ) {
          upgradeSpinner.fail(theme.error("Permission denied"));
          console.log(
            chalk.yellow("\nTry running with sudo:\n") +
              theme.accent("sudo uva upgrade"),
          );
        } else {
          upgradeSpinner.fail(theme.error("Upgrade failed"));
          console.log(
            chalk.gray("\nPlease upgrade manually:\n") +
              theme.accent(`curl -fsSL ${PROD_SITE_URL}/install.sh | bash`),
          );
        }
        process.exit(1);
      }
    } catch (error: any) {
      upgradeSpinner.fail(theme.error("Upgrade failed"));
      console.log(
        chalk.gray("\nPlease upgrade manually:\n") +
          theme.accent(`curl -fsSL ${PROD_SITE_URL}/install.sh | bash`),
      );
      process.exit(1);
    }
  } catch (error: any) {
    spinner.fail(theme.error(`Error: ${error.message}`));
    process.exit(1);
  }
}

export function registerUpgradeCommand(program: Command) {
  program
    .command("upgrade")
    .description("Upgrade the uvacompute CLI to the latest version")
    .action(upgrade);
}
