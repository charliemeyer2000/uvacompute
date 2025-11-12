import type { Command } from "commander";
import { parseEnv, log } from "tabtab";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
} from "fs";
import {
  getBaseUrl,
  loadToken,
  hasShownCompletionPrompt,
  markCompletionPromptShown,
} from "./lib/utils";
import { VMListResponseSchema, SSHKeyListResponseSchema } from "./lib/schemas";
import { theme } from "./lib/theme";

const BASE_URL = getBaseUrl();

let cachedProgram: Command | null = null;

const COMPLETION_SCRIPTS = {
  zsh: `###-begin-uva-completions-###
_uva_completions()
{
  local -a reply
  local si=$IFS
  IFS=$'\\n'
  reply=($(COMP_CWORD="$((CURRENT-1))" COMP_LINE="$BUFFER" COMP_POINT="$CURSOR" uva))
  IFS=$si
  _describe 'values' reply
}
compdef _uva_completions uva
###-end-uva-completions-###
`,
  bash: `###-begin-uva-completions-###
_uva_completions()
{
    local cur="\${COMP_WORDS[COMP_CWORD]}"
    local completions
    
    completions=$(COMP_CWORD="$COMP_CWORD" COMP_LINE="$COMP_LINE" COMP_POINT="$COMP_POINT" uva)
    
    COMPREPLY=($(compgen -W "$completions" -- "$cur"))
    
    return 0
}
complete -o default -F _uva_completions uva
###-end-uva-completions-###
`,
} as const;

function detectShell(): "bash" | "zsh" | null {
  const shell = process.env.SHELL || "";
  if (shell.includes("zsh")) return "zsh";
  if (shell.includes("bash")) return "bash";
  return null;
}

async function installCompletion(): Promise<void> {
  try {
    const shell = detectShell();
    if (!shell) {
      console.log(
        theme.warning(
          "Could not detect shell. Only Bash and Zsh are supported.",
        ),
      );
      process.exit(1);
    }

    const home = process.env.HOME;
    if (!home) {
      console.log(theme.warning("Could not determine home directory."));
      process.exit(1);
    }

    const tabtabDir = `${home}/.config/tabtab`;
    const completionFile = `${tabtabDir}/uva.${shell}`;
    const shellRc = shell === "zsh" ? `${home}/.zshrc` : `${home}/.bashrc`;

    if (!existsSync(tabtabDir)) {
      mkdirSync(tabtabDir, { recursive: true });
    }

    writeFileSync(completionFile, COMPLETION_SCRIPTS[shell]);

    let rcContent = existsSync(shellRc) ? readFileSync(shellRc, "utf-8") : "";
    const sourceLine = `[[ -f ${completionFile} ]] && . ${completionFile} || true`;

    if (!rcContent.includes(sourceLine)) {
      if (!rcContent.endsWith("\n")) {
        rcContent += "\n";
      }
      rcContent += "# tabtab source for uva package\n";
      rcContent += "# uninstall by removing these lines\n";
      rcContent += `${sourceLine}\n`;
      writeFileSync(shellRc, rcContent);
    }

    console.log(theme.success("✓ Tab completion installed successfully!"));
    console.log(theme.muted(`\nCompletion script: ${completionFile}`));
    console.log(theme.muted(`Shell config: ${shellRc}`));
    console.log(theme.muted(`\nRestart your shell or run: source ${shellRc}`));
  } catch (error: any) {
    console.log(
      theme.warning(`Failed to install completion: ${error.message}`),
    );
    process.exit(1);
  }
}

async function uninstallCompletion(): Promise<void> {
  try {
    const shell = detectShell();
    if (!shell) {
      console.log(theme.warning("Could not detect shell."));
      process.exit(1);
    }

    const home = process.env.HOME;
    if (!home) {
      console.log(theme.warning("Could not determine home directory."));
      process.exit(1);
    }

    const tabtabDir = `${home}/.config/tabtab`;
    const completionFile = `${tabtabDir}/uva.${shell}`;
    const shellRc = shell === "zsh" ? `${home}/.zshrc` : `${home}/.bashrc`;

    if (existsSync(completionFile)) {
      unlinkSync(completionFile);
    }

    if (existsSync(shellRc)) {
      let rcContent = readFileSync(shellRc, "utf-8");
      const lines = rcContent.split("\n");
      const filtered = lines.filter(
        (line) =>
          !line.includes(completionFile) &&
          !line.includes("tabtab source for uva") &&
          !line.includes("uninstall by removing these lines"),
      );
      writeFileSync(shellRc, filtered.join("\n"));
    }

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
  commandObj: Command,
  subcommandObj: Command,
): boolean {
  // Check if this is the "vm" command and subcommand has arguments
  // commandObj.name() is extracted from Commander.js dynamically
  if (commandObj.name() !== "vm") return false;
  const args = subcommandObj.registeredArguments || subcommandObj.args || [];
  return args.length > 0;
}

function needsSSHKeyCompletion(
  commandObj: Command,
  subcommandObj: Command,
): boolean {
  // Check if this is the "ssh-key" command and subcommand has arguments
  // commandObj.name() is extracted from Commander.js dynamically
  if (commandObj.name() !== "ssh-key") return false;
  const args = subcommandObj.registeredArguments || subcommandObj.args || [];
  return args.length > 0;
}

async function fetchVMsForCompletion(
  subcommandName: string,
): Promise<string[]> {
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
      let include = false;

      // Business logic: filter VMs based on what the subcommand can operate on
      // subcommandName is extracted from Commander.js, not hardcoded
      if (subcommandName === "ssh") {
        include = vm.status === "running";
      } else if (subcommandName === "delete" || subcommandName === "rm") {
        include = vm.status !== "expired" && vm.status !== "deleted";
      } else {
        include = true;
      }

      if (include) {
        if (vm.name) {
          completions.push(vm.name);
        }
        completions.push(vm.vmId);
      }
    }

    return completions;
  } catch (error) {
    return [];
  }
}

async function fetchSSHKeysForCompletion(): Promise<string[]> {
  try {
    const token = loadToken();
    if (!token) return [];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 500);

    const response = await fetch(`${BASE_URL}/api/ssh-keys`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) return [];

    const data = SSHKeyListResponseSchema.parse(await response.json());
    return data.keys.map((key) => key._id);
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

    if (needsVMCompletion(commandObj, subcommandObj)) {
      if (!lastPartial.startsWith("-")) {
        const vms = await fetchVMsForCompletion(subcommandObj.name());
        log(vms.filter((vm) => vm.startsWith(lastPartial)));
        process.exit(0);
      }
    }

    if (needsSSHKeyCompletion(commandObj, subcommandObj)) {
      if (!lastPartial.startsWith("-")) {
        const keys = await fetchSSHKeysForCompletion();
        log(keys.filter((key) => key.startsWith(lastPartial)));
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
