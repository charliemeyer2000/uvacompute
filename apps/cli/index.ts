import { Command } from "commander";
import { registerLoginCommand } from "./src/login";
import { registerIncrementCommand } from "./src/increment";

function main() {
  const program = new Command();

  program
    .version(require("./package.json").version)
    .name("uva")
    .description("uvacompute cli");
  registerLoginCommand(program);
  registerIncrementCommand(program);
  program.parse(process.argv);
}

main();
