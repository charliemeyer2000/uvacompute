import type { Command } from "commander";
import ora from "ora";
import { existsSync, rmSync } from "fs";
import { confirm } from "./lib/prompt";
import { CONFIG_DIR } from "./lib/constants";
import { theme } from "./lib/theme";
import { findBinaryPath } from "./lib/utils";
import chalk from "chalk";

async function uninstall(): Promise<void> {
  console.log(
    chalk.yellow(
      "\nThis will remove the uvacompute CLI and all configuration data.",
    ),
  );
  console.log();

  const response = await confirm({
    message: "Are you sure you want to uninstall?",
    default: false,
  });

  if (!response) {
    console.log(chalk.gray("\nUninstall cancelled."));
    process.exit(0);
  }

  console.log();
  const spinner = ora("Uninstalling uvacompute CLI...").start();

  try {
    const binaryPath = await findBinaryPath();
    let removedBinary = false;
    let removedConfig = false;

    if (binaryPath) {
      try {
        const { unlinkSync } = await import("fs");
        unlinkSync(binaryPath);
        removedBinary = true;
        spinner.text = "Removed CLI binary...";
      } catch (error: any) {
        if (error.code === "EACCES") {
          spinner.warn(
            theme.warning(
              `Permission denied. Please run: ${chalk.bold(`sudo rm ${binaryPath}`)}`,
            ),
          );
        } else {
          spinner.warn(
            theme.warning(`Could not remove binary: ${error.message}`),
          );
        }
      }
    } else {
      spinner.info("CLI binary location not found in PATH");
    }

    if (existsSync(CONFIG_DIR)) {
      try {
        rmSync(CONFIG_DIR, { recursive: true, force: true });
        removedConfig = true;
        spinner.text = "Removed configuration directory...";
      } catch (error: any) {
        spinner.warn(
          theme.warning(`Could not remove config: ${error.message}`),
        );
      }
    }

    if (removedBinary || removedConfig) {
      spinner.succeed(
        theme.success("uvacompute CLI uninstalled successfully!"),
      );

      if (!removedBinary && binaryPath) {
        console.log(
          chalk.yellow(
            `\nNote: The binary at ${chalk.bold(binaryPath)} needs to be removed manually with sudo.`,
          ),
        );
      }

      console.log(chalk.gray("\nGoodbye!\n"));
    } else {
      spinner.info("Nothing to uninstall");
    }

    process.exit(0);
  } catch (error: any) {
    spinner.fail(`Error during uninstall: ${error.message}`);
    process.exit(1);
  }
}

export function registerUninstallCommand(program: Command) {
  program
    .command("uninstall")
    .description("Uninstall the uvacompute CLI")
    .action(uninstall);
}
