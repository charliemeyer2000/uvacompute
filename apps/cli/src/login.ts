import type { Command } from "commander";
import { getValidationString } from "@/lib/utils";
import ora from "ora";

export function registerLoginCommand(program: Command) {
  program
    .command("login")
    .description("Login to uvacompute")
    .action(async () => {
      const spinner = ora("Logging in...\n").start();
      const string = getValidationString();
      // wait for 1 second
      await new Promise((resolve) => setTimeout(resolve, 1000));
      spinner.succeed(`Logged in successfully!\n`);
      console.log(`\n${string}\n`);
      spinner.stop();
    });
}
