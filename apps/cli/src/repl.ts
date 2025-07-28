import { Command } from "commander";
import { createInterface } from "readline";
import { registerLoginCommand } from "./login";

export function startInteractiveMode() {
  console.log("🚀 uvacompute CLI - Interactive Mode");
  console.log("Type 'help' for available commands or 'exit' to quit\n");

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "uva> ",
  });

  rl.prompt();

  rl.on("line", async (input) => {
    const trimmed = input.trim();

    if (trimmed === "exit" || trimmed === "quit") {
      console.log("Goodbye! 👋");
      rl.close();
      return;
    }

    if (trimmed === "clear") {
      console.clear();
      rl.prompt();
      return;
    }

    if (trimmed === "") {
      rl.prompt();
      return;
    }

    try {
      // Parse the command by simulating argv
      const args = ["node", "uva", ...trimmed.split(" ")];

      // Create a new program instance for each command to avoid conflicts
      const interactiveProgram = new Command();
      interactiveProgram
        .version(require("../package.json").version)
        .name("uva")
        .description("uvacompute cli");
      registerLoginCommand(interactiveProgram);

      // Suppress default error handling
      interactiveProgram.exitOverride();

      await interactiveProgram.parseAsync(args);
    } catch (error: any) {
      if (error.code === "commander.help") {
        // Help was displayed, that's fine
      } else if (error.code === "commander.version") {
        // Version was displayed, that's fine
      } else if (error.code === "commander.unknownCommand") {
        console.log(`Unknown command: ${trimmed}`);
        console.log("Type 'help' for available commands");
      } else {
        console.log(`Error: ${error.message}`);
      }
    }

    console.log(); // Add some spacing
    rl.prompt();
  });

  rl.on("close", () => {
    // Don't exit the process in development watch mode
    if (process.env.NODE_ENV !== "development") {
      process.exit(0);
    }
  });

  // Handle Ctrl+C gracefully
  rl.on("SIGINT", () => {
    console.log("\nUse 'exit' to quit or Ctrl+C again to force quit");
    rl.prompt();
  });
}
