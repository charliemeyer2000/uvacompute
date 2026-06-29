import { Command } from "commander";
import { registerLoginCommand } from "./src/login";
import { registerLogoutCommand } from "./src/logout";
import { registerVMCommands } from "./src/vm";
import { registerSSHKeyCommands } from "./src/ssh-keys";
import { registerUserCommands } from "./src/user";
import { registerUninstallCommand } from "./src/uninstall";
import { registerUpgradeCommand } from "./src/upgrade";
import { registerNodeCommands } from "./src/node";
import { registerJobCommands } from "./src/jobs";
import { registerApiKeyCommands } from "./src/api-keys";
import { checkForUpdate } from "./src/lib/version-check";
import { setNonInteractive } from "./src/lib/utils";
import {
  handleCompletion,
  registerCompletionCommands,
  checkAndPromptCompletion,
} from "./src/completion";

async function main() {
  const program = new Command();

  program
    .version(require("./package.json").version)
    .name("uva")
    .description("uvacompute cli")
    .option("-y, --yes", "Skip all confirmation prompts");

  program.addHelpText(
    "after",
    `
Examples:
  $ uva vm create -h 4 -n dev-box              # Spin up a VM for 4 hours
  $ uva vm create -h 12 -c 8 -r 32 -g 1        # Create a GPU VM with 8 CPUs and 32 GB RAM
  $ uva vm list --all                           # List all VMs including stopped/expired
  $ uva vm ssh dev-box                          # SSH into a VM by name
  $ uva run --gpu pytorch/pytorch python train.py  # Run a GPU container job`,
  );

  program.hook("preAction", (thisCommand) => {
    const opts = thisCommand.optsWithGlobals();
    if (opts.yes || !process.stdout.isTTY) {
      setNonInteractive(true);
    }
  });
  registerLoginCommand(program);
  registerLogoutCommand(program);
  registerVMCommands(program);
  registerSSHKeyCommands(program);
  registerUserCommands(program);
  registerUninstallCommand(program);
  registerUpgradeCommand(program);
  registerNodeCommands(program);
  registerJobCommands(program);
  registerApiKeyCommands(program);
  registerCompletionCommands(program);

  await handleCompletion();

  await checkForUpdate().catch(() => {});

  program.parse(process.argv);

  checkAndPromptCompletion();
}

main();
