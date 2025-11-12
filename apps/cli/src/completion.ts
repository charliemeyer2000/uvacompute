import type { Command } from "commander";
import { install, uninstall, parseEnv, log } from "tabtab";
import { existsSync } from "fs";
import {
  getBaseUrl,
  loadToken,
  hasShownCompletionPrompt,
  markCompletionPromptShown,
} from "./lib/utils";
import { VMListResponseSchema } from "./lib/schemas";
import { theme } from "./lib/theme";

const BASE_URL = getBaseUrl();

let cachedProgram: Command | null = null;

async function installCompletion(): Promise<void> {
  try {
    await install({
      name: "uva",
      completer: "uva",
    });
    console.log(theme.success("✓ Tab completion installed successfully!"));
    console.log(
      theme.muted(
        "\nPlease restart your shell or run: source ~/.bashrc (or ~/.zshrc)",
      ),
    );
  } catch (error: any) {
    console.log(
      theme.warning(`Failed to install completion: ${error.message}`),
    );
    process.exit(1);
  }
}

async function uninstallCompletion(): Promise<void> {
  try {
    await uninstall({
      name: "uva",
    });
    console.log(theme.success("✓ Tab completion uninstalled successfully!"));
  } catch (error: any) {
    console.log(
      theme.warning(`Failed to uninstall completion: ${error.message}`),
    );
    process.exit(1);
  }
}

function getCommandNames(program: Command): string[] {
  return program.commands.map((cmd) => cmd.name());
}

function getSubcommandNames(program: Command, commandName: string): string[] {
  const command = program.commands.find((cmd) => cmd.name() === commandName);
  if (!command) return [];
  return command.commands.map((cmd) => cmd.name());
}

function getCommandOptions(
  program: Command,
  commandName: string,
  subcommandName?: string,
): string[] {
  const command = program.commands.find((cmd) => cmd.name() === commandName);
  if (!command) return [];

  let targetCommand = command;
  if (subcommandName) {
    const subcommand = command.commands.find(
      (cmd) => cmd.name() === subcommandName,
    );
    if (!subcommand) return [];
    targetCommand = subcommand;
  }

  const longFlags: string[] = [];
  const shortFlags: string[] = [];

  for (const option of targetCommand.options) {
    if (option.long) longFlags.push(option.long);
    if (option.short) shortFlags.push(option.short);
  }

  return [...longFlags, ...shortFlags];
}

function needsVMCompletion(
  commandName: string,
  subcommandObj: Command,
): boolean {
  if (commandName !== "vm") return false;
  const args = subcommandObj.registeredArguments || subcommandObj.args || [];
  return args.length > 0;
}

async function fetchVMsForCompletion(): Promise<string[]> {
  try {
    const token = loadToken();
    if (!token) return [];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 500);

    const response = await fetch(`${BASE_URL}/api/vms`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) return [];

    const data = VMListResponseSchema.parse(await response.json());
    const completions: string[] = [];

    for (const vm of data.vms) {
      if (vm.name) {
        completions.push(vm.name);
      }
      completions.push(vm.vmId);
    }

    return completions;
  } catch (error) {
    return [];
  }
}

export async function handleCompletion(): Promise<void> {
  const env = parseEnv(process.env);
  if (!env.complete || !cachedProgram) return;

  const line = env.line || "";
  const words = line.split(/\s+/).filter(Boolean);
  const lastPartial = env.lastPartial || "";
  const prev = env.prev || "";

  if (words.length <= 1) {
    const commands = getCommandNames(cachedProgram);
    log(commands.filter((cmd) => cmd.startsWith(lastPartial)));
    process.exit(0);
  }

  const command = words[1];
  if (!command) {
    log([]);
    process.exit(0);
  }

  const commandObj = cachedProgram.commands.find(
    (cmd) => cmd.name() === command,
  );

  if (!commandObj) {
    const commands = getCommandNames(cachedProgram);
    log(commands.filter((cmd) => cmd.startsWith(lastPartial)));
    process.exit(0);
  }

  if (commandObj.commands.length > 0) {
    if (words.length === 2 || (prev === command && lastPartial !== command)) {
      const subcommands = getSubcommandNames(cachedProgram, command);
      log(subcommands.filter((cmd) => cmd.startsWith(lastPartial)));
      process.exit(0);
    }

    const subcommand = words[2];
    if (!subcommand) {
      const subcommands = getSubcommandNames(cachedProgram, command);
      log(subcommands.filter((cmd) => cmd.startsWith(lastPartial)));
      process.exit(0);
    }

    const subcommandObj = commandObj.commands.find(
      (cmd) => cmd.name() === subcommand,
    );

    if (!subcommandObj) {
      const subcommands = getSubcommandNames(cachedProgram, command);
      log(subcommands.filter((cmd) => cmd.startsWith(lastPartial)));
      process.exit(0);
    }

    if (needsVMCompletion(command, subcommandObj)) {
      if (!lastPartial.startsWith("-")) {
        const vms = await fetchVMsForCompletion();
        log(vms.filter((vm) => vm.startsWith(lastPartial)));
        process.exit(0);
      }
    }

    if (lastPartial.startsWith("-")) {
      const options = getCommandOptions(cachedProgram, command, subcommand);
      log(options.filter((opt) => opt.startsWith(lastPartial)));
      process.exit(0);
    }
  } else if (lastPartial.startsWith("-")) {
    const options = getCommandOptions(cachedProgram, command);
    log(options.filter((opt) => opt.startsWith(lastPartial)));
    process.exit(0);
  }

  log([]);
  process.exit(0);
}

function isCompletionInstalled(): boolean {
  const home = process.env.HOME;
  if (!home) return false;

  const tabtabDir = `${home}/.config/tabtab`;
  return existsSync(tabtabDir);
}

export function checkAndPromptCompletion(): void {
  if (process.env.TABTAB_COMPLETION) {
    return;
  }

  const isInteractive = process.stdout.isTTY;
  if (!isInteractive) return;

  if (hasShownCompletionPrompt()) return;

  if (!isCompletionInstalled()) {
    console.log(
      theme.muted(
        "\n💡 Tip: Enable tab completion with: uva completion install\n",
      ),
    );
    markCompletionPromptShown();
  }
}

export function registerCompletionCommands(program: Command): void {
  cachedProgram = program;

  const completion = program
    .command("completion")
    .description("Manage shell completion");

  completion
    .command("install")
    .description("Install shell completion for uva")
    .action(installCompletion);

  completion
    .command("uninstall")
    .description("Uninstall shell completion for uva")
    .action(uninstallCompletion);
}
