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
import {
  VMListResponseSchema,
  SSHKeyListResponseSchema,
  VM_STATUS_GROUPS,
  isVMStatusInGroup,
  JobListResponseSchema,
  JOB_STATUS_GROUPS,
  isJobStatusInGroup,
  JobStatusEnum,
  NodeListResponseSchema,
  NODE_STATUS_GROUPS,
  isNodeStatusInGroup,
} from "./lib/schemas";
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

function needsJobCompletion(commandObj: Command): boolean {
  // Job commands (logs, cancel) are top-level commands that take jobId argument
  const commandName = commandObj.name();
  return commandName === "logs" || commandName === "cancel";
}

function needsNodeCompletion(
  commandObj: Command,
  subcommandObj: Command,
): boolean {
  // Check if this is the "node" command and subcommand needs nodeId
  if (commandObj.name() !== "node") return false;
  const subcommandName = subcommandObj.name();
  // These subcommands take optional or required nodeId
  return ["status", "pause", "resume", "workloads"].includes(subcommandName);
}

function truncateVmId(vmId: string): string {
  return vmId.slice(0, 8);
}

function truncateJobId(jobId: string): string {
  return jobId.slice(0, 8);
}

function truncateNodeId(nodeId: string): string {
  return nodeId.slice(0, 8);
}

async function fetchVMsForCompletion(
  subcommandName: string,
): Promise<string[]> {
  try {
    const token = loadToken();
    if (!token) return [];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 500);

    try {
      const response = await fetch(`${BASE_URL}/api/vms`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) return [];

      const data = VMListResponseSchema.parse(await response.json());

      const filteredVMs = data.vms.filter((vm) => {
        if (subcommandName === "ssh") {
          return isVMStatusInGroup(vm.status, VM_STATUS_GROUPS.READY);
        } else if (subcommandName === "delete" || subcommandName === "rm") {
          return isVMStatusInGroup(vm.status, VM_STATUS_GROUPS.DELETABLE);
        }
        return true;
      });

      const nameCounts = new Map<string, number>();
      for (const vm of filteredVMs) {
        if (vm.name) {
          nameCounts.set(vm.name, (nameCounts.get(vm.name) || 0) + 1);
        }
      }

      const completions: string[] = [];
      for (const vm of filteredVMs) {
        if (!vm.name) {
          completions.push(truncateVmId(vm.vmId));
        } else {
          const count = nameCounts.get(vm.name) ?? 0;
          if (count > 1) {
            completions.push(`${vm.name} (${truncateVmId(vm.vmId)})`);
          } else {
            completions.push(vm.name);
          }
        }
      }

      return completions;
    } catch (fetchError) {
      clearTimeout(timeoutId);
      return [];
    }
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

    try {
      const response = await fetch(`${BASE_URL}/api/ssh-keys`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) return [];

      const data = SSHKeyListResponseSchema.parse(await response.json());
      return data.keys.map((key) => key._id);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      return [];
    }
  } catch (error) {
    return [];
  }
}

async function fetchJobsForCompletion(commandName: string): Promise<string[]> {
  try {
    const token = loadToken();
    if (!token) return [];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 500);

    try {
      const response = await fetch(`${BASE_URL}/api/jobs`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) return [];

      const data = JobListResponseSchema.parse(await response.json());

      const filteredJobs = data.jobs.filter((job) => {
        if (commandName === "cancel") {
          return isJobStatusInGroup(job.status, JOB_STATUS_GROUPS.CANCELLABLE);
        }
        // For logs, show all jobs (users may want completed job logs)
        return true;
      });

      const nameCounts = new Map<string, number>();
      for (const job of filteredJobs) {
        if (job.name) {
          nameCounts.set(job.name, (nameCounts.get(job.name) || 0) + 1);
        }
      }

      const completions: string[] = [];
      for (const job of filteredJobs) {
        if (!job.name) {
          completions.push(truncateJobId(job.jobId));
        } else {
          const count = nameCounts.get(job.name) ?? 0;
          if (count > 1) {
            completions.push(`${job.name} (${truncateJobId(job.jobId)})`);
          } else {
            completions.push(job.name);
          }
        }
      }

      return completions;
    } catch (fetchError) {
      clearTimeout(timeoutId);
      return [];
    }
  } catch (error) {
    return [];
  }
}

async function fetchNodesForCompletion(
  subcommandName: string,
): Promise<string[]> {
  try {
    const token = loadToken();
    if (!token) return [];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 500);

    try {
      const response = await fetch(`${BASE_URL}/api/contributor/nodes`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) return [];

      const data = NodeListResponseSchema.parse(await response.json());

      const filteredNodes = data.nodes.filter((node) => {
        if (subcommandName === "pause") {
          return isNodeStatusInGroup(node.status, NODE_STATUS_GROUPS.PAUSABLE);
        } else if (subcommandName === "resume") {
          return isNodeStatusInGroup(node.status, NODE_STATUS_GROUPS.RESUMABLE);
        }
        // For status and workloads, show all nodes
        return true;
      });

      const nameCounts = new Map<string, number>();
      for (const node of filteredNodes) {
        if (node.name) {
          nameCounts.set(node.name, (nameCounts.get(node.name) || 0) + 1);
        }
      }

      const completions: string[] = [];
      for (const node of filteredNodes) {
        if (!node.name) {
          completions.push(truncateNodeId(node.nodeId));
        } else {
          const count = nameCounts.get(node.name) ?? 0;
          if (count > 1) {
            completions.push(`${node.name} (${truncateNodeId(node.nodeId)})`);
          } else {
            completions.push(node.name);
          }
        }
      }

      return completions;
    } catch (fetchError) {
      clearTimeout(timeoutId);
      return [];
    }
  } catch (error) {
    return [];
  }
}

function getJobStatusValues(): string[] {
  return JobStatusEnum.options;
}

function needsOptionValueCompletion(
  prev: string,
  commandName: string,
): boolean {
  // Check if we're completing the value for --status on the jobs command
  return commandName === "jobs" && (prev === "--status" || prev === "-s");
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

    if (needsNodeCompletion(commandObj, subcommandObj)) {
      if (!lastPartial.startsWith("-")) {
        const nodes = await fetchNodesForCompletion(subcommandObj.name());
        log(nodes.filter((node) => node.startsWith(lastPartial)));
        process.exit(0);
      }
    }

    if (lastPartial.startsWith("-")) {
      const options = getCommandOptions(cachedProgram, command, subcommand);
      log(options.filter((opt) => opt.startsWith(lastPartial)));
      process.exit(0);
    }
  } else {
    // Handle option value completion (e.g., --status for jobs command)
    if (needsOptionValueCompletion(prev, command)) {
      const statusValues = getJobStatusValues();
      log(statusValues.filter((val) => val.startsWith(lastPartial)));
      process.exit(0);
    }

    // Handle job completion for top-level commands (logs, cancel)
    if (needsJobCompletion(commandObj)) {
      if (!lastPartial.startsWith("-")) {
        const jobs = await fetchJobsForCompletion(command);
        log(jobs.filter((job) => job.startsWith(lastPartial)));
        process.exit(0);
      }
    }

    // Handle options for commands without subcommands
    if (lastPartial.startsWith("-")) {
      const options = getCommandOptions(cachedProgram, command);
      log(options.filter((opt) => opt.startsWith(lastPartial)));
      process.exit(0);
    }
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
