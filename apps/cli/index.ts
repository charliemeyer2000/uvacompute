import { Command } from "commander";
import { registerLoginCommand } from "./src/login";
import { registerVMCommands } from "./src/vm";
import { registerSSHKeyCommands } from "./src/ssh-keys";
import { registerUserCommands } from "./src/user";
import { registerUninstallCommand } from "./src/uninstall";
import { checkForUpdate } from "./src/lib/version-check";

async function main() {
  await checkForUpdate().catch(() => {});

  const program = new Command();

  program
    .version(require("./package.json").version)
    .name("uva")
    .description("uvacompute cli");
  registerLoginCommand(program);
  registerVMCommands(program);
  registerSSHKeyCommands(program);
  registerUserCommands(program);
  registerUninstallCommand(program);
  program.parse(process.argv);
}

main();
