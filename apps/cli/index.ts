import { Command } from "commander";
import { registerLoginCommand } from "./src/login";
import { startInteractiveMode } from "./src/repl";

function main() {
  const program = new Command();

  program
    .version(require("./package.json").version)
    .name("uva")
    .description("uvacompute cli");
  registerLoginCommand(program);

  // ONLY add interactive functionality in development
  if (process.env.NODE_ENV === "development") {
    program.option("-i, --interactive", "run in interactive mode");

    const hasInteractiveFlag =
      process.argv.includes("--interactive") || process.argv.includes("-i");
    const shouldRunInteractive = hasInteractiveFlag || process.argv.length <= 2;

    if (shouldRunInteractive) {
      startInteractiveMode();
      return;
    }
  }

  // Production behavior: normal CLI only
  program.parse(process.argv);
}

main();
