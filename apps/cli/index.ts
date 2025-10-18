import { Command } from "commander";
import { registerLoginCommand } from "./src/login";
import { registerVMCommands } from "./src/vm";

function main() {
  const program = new Command();

  program
    .version(require("./package.json").version)
    .name("uva")
    .description("uvacompute cli");
  registerLoginCommand(program);
  registerVMCommands(program);
  program.parse(process.argv);
}

main();
