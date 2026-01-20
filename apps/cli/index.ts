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
import { checkForUpdate } from "./src/lib/version-check";
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
    .description("uvacompute cli");
  registerLoginCommand(program);
  registerLogoutCommand(program);
  registerVMCommands(program);
  registerSSHKeyCommands(program);
  registerUserCommands(program);
  registerUninstallCommand(program);
  registerUpgradeCommand(program);
  registerNodeCommands(program);
  registerJobCommands(program);
  registerCompletionCommands(program);

  await handleCompletion();

  await checkForUpdate().catch(() => {});

  program.parse(process.argv);

  checkAndPromptCompletion();
}

main();
