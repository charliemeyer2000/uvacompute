import { Command } from "commander";
import { registerLoginCommand } from "./src/login";
import { startInteractiveMode } from "./src/repl";

const program = new Command();

program
  .version(require("./package.json").version)
  .name("uva")
  .description("uvacompute cli");
registerLoginCommand(program);

program.option("-i, --interactive", "run in interactive mode");

const isDevelopment = process.env.NODE_ENV === "development";
const hasInteractiveFlag =
  process.argv.includes("--interactive") || process.argv.includes("-i");

const shouldRunInteractive =
  isDevelopment && (hasInteractiveFlag || process.argv.length <= 2);

if (shouldRunInteractive) {
  startInteractiveMode();
} else if (!isDevelopment && hasInteractiveFlag) {
  console.error("Interactive mode is only available in development");
  process.exit(1);
} else {
  if (process.argv.length <= 2) {
    program.help();
  } else {
    program.parse(process.argv);
  }
}
