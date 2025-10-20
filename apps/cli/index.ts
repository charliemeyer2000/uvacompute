import { Command } from "commander";
import { registerLoginCommand } from "./src/login";
import { registerVMCommands } from "./src/vm";
import { registerSSHKeyCommands } from "./src/ssh-keys";

function main() {
  const program = new Command();

  program
    .version(require("./package.json").version)
    .name("uva")
    .description("uvacompute cli");
  registerLoginCommand(program);
  registerVMCommands(program);
  registerSSHKeyCommands(program);
  program.parse(process.argv);
}

main();
