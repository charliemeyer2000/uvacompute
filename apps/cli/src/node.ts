import type { Command } from "commander";
import ora from "ora";
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { confirm } from "@inquirer/prompts";
import { spawn } from "child_process";
import {
  NODE_CONFIG_DIR,
  NODE_CONFIG_FILE,
  NODE_STATE_FILE,
  INSTALL_SCRIPT_URL,
  PROD_SITE_URL,
  DEV_SITE_URL,
} from "./lib/constants";
import { theme } from "./lib/theme";
import chalk from "chalk";
import yaml from "js-yaml";

interface NodeConfig {
  node_id?: string;
  install_date?: string;
  k3s_version?: string;
  kubevirt_version?: string;
}

interface NodeState {
  installed: boolean;
  components?: string[];
  gpu_detected?: boolean;
  gpu_pci?: string;
  gpu_audio_pci?: string;
  gpu_device_id?: string;
}

function loadNodeConfig(): NodeConfig | null {
  try {
    if (!existsSync(NODE_CONFIG_FILE)) {
      return null;
    }
    const content = readFileSync(NODE_CONFIG_FILE, "utf8");
    return yaml.load(content) as NodeConfig;
  } catch {
    return null;
  }
}

function loadNodeState(): NodeState | null {
  try {
    if (!existsSync(NODE_STATE_FILE)) {
      return null;
    }
    const content = readFileSync(NODE_STATE_FILE, "utf8");
    return yaml.load(content) as NodeState;
  } catch {
    return null;
  }
}

function getBaseUrl(): string {
  if (process.env.SITE_URL) {
    return process.env.SITE_URL;
  }
  if (process.env.NODE_ENV === "production") {
    return PROD_SITE_URL;
  }
  return DEV_SITE_URL;
}

async function runCommand(
  command: string,
  args: string[],
  options?: { sudo?: boolean },
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const cmd = options?.sudo ? "sudo" : command;
    const cmdArgs = options?.sudo ? [command, ...args] : args;

    const proc = spawn(cmd, cmdArgs, {
      stdio: ["inherit", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
      process.stdout.write(data);
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
      process.stderr.write(data);
    });

    proc.on("close", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });

    proc.on("error", (err) => {
      resolve({ exitCode: 1, stdout, stderr: err.message });
    });
  });
}

async function checkK3sStatus(): Promise<{
  running: boolean;
  version?: string;
}> {
  try {
    const result = await runCommand("kubectl", ["version", "--short"], {
      sudo: true,
    });
    if (result.exitCode === 0) {
      const match = result.stdout.match(/Server Version: (v[\d.]+)/);
      return { running: true, version: match?.[1] };
    }
  } catch {}
  return { running: false };
}

async function checkKubeVirtStatus(): Promise<{
  installed: boolean;
  phase?: string;
}> {
  try {
    const result = await runCommand(
      "kubectl",
      [
        "get",
        "kubevirt",
        "-n",
        "kubevirt",
        "-o",
        "jsonpath={.items[0].status.phase}",
      ],
      { sudo: true },
    );
    if (result.exitCode === 0 && result.stdout.trim()) {
      return { installed: true, phase: result.stdout.trim() };
    }
  } catch {}
  return { installed: false };
}

async function checkGpuStatus(): Promise<{
  detected: boolean;
  driver?: string;
  available?: boolean;
}> {
  try {
    const lspciResult = await runCommand("lspci", []);
    if (!lspciResult.stdout.toLowerCase().includes("nvidia")) {
      return { detected: false };
    }

    const driverResult = await runCommand("bash", [
      "-c",
      "lspci -nnk | grep -A3 -i 'vga.*nvidia' | grep 'driver in use' | awk '{print $NF}'",
    ]);
    const driver = driverResult.stdout.trim() || "none";

    const nodeResult = await runCommand(
      "kubectl",
      ["describe", "node", "-o", "jsonpath={.items[0].status.allocatable}"],
      { sudo: true },
    );
    const available = nodeResult.stdout.includes("nvidia.com/gpu");

    return { detected: true, driver, available };
  } catch {
    return { detected: false };
  }
}

async function nodeInstall(): Promise<void> {
  console.log(chalk.bold("\n🚀 uvacompute Node Installation\n"));

  const state = loadNodeState();
  if (state?.installed) {
    console.log(chalk.yellow("Node appears to be already installed."));
    const proceed = await confirm({
      message: "Do you want to reinstall?",
      default: false,
    });
    if (!proceed) {
      console.log(chalk.gray("Installation cancelled."));
      process.exit(0);
    }
  }

  console.log(chalk.gray("This will install:"));
  console.log(chalk.gray("  • k3s (Kubernetes)"));
  console.log(chalk.gray("  • KubeVirt (VM orchestration)"));
  console.log(chalk.gray("  • NVIDIA container toolkit (if GPU detected)"));
  console.log();

  const proceed = await confirm({
    message: "Do you want to continue?",
    default: true,
  });

  if (!proceed) {
    console.log(chalk.gray("\nInstallation cancelled."));
    process.exit(0);
  }

  console.log();
  const spinner = ora("Downloading install script...").start();

  try {
    const baseUrl = getBaseUrl();
    const scriptUrl = `${baseUrl}/install-node.sh`;

    const response = await fetch(scriptUrl);
    if (!response.ok) {
      throw new Error(`Failed to download script: ${response.status}`);
    }

    const script = await response.text();
    spinner.succeed("Downloaded install script");

    console.log(
      chalk.gray("\nRunning installation (this may take several minutes)...\n"),
    );

    const tmpFile = `/tmp/install-node-${Date.now()}.sh`;
    writeFileSync(tmpFile, script, { mode: 0o755 });

    const result = await runCommand("bash", [tmpFile], { sudo: true });

    try {
      rmSync(tmpFile);
    } catch {}

    if (result.exitCode !== 0) {
      console.log(chalk.red("\n✗ Installation failed"));
      process.exit(1);
    }

    console.log(chalk.green("\n✓ Node installation complete!"));
    console.log();
    console.log(chalk.gray("Next steps:"));
    console.log(
      chalk.gray("  • Run 'uva node status' to check the node status"),
    );
    console.log(
      chalk.gray(
        "  • If you have a GPU, run 'sudo gpu-mode-status' to check GPU mode",
      ),
    );
    console.log();
  } catch (error: any) {
    spinner.fail(`Installation failed: ${error.message}`);
    process.exit(1);
  }
}

async function nodeUninstall(): Promise<void> {
  console.log(chalk.bold("\n🗑️  uvacompute Node Uninstallation\n"));

  const state = loadNodeState();
  if (!state?.installed) {
    console.log(chalk.yellow("Node does not appear to be installed."));
    const proceed = await confirm({
      message: "Do you want to attempt uninstallation anyway?",
      default: false,
    });
    if (!proceed) {
      console.log(chalk.gray("Uninstallation cancelled."));
      process.exit(0);
    }
  }

  console.log(chalk.yellow("This will remove:"));
  console.log(chalk.yellow("  • k3s and all Kubernetes resources"));
  console.log(chalk.yellow("  • KubeVirt"));
  console.log(chalk.yellow("  • NVIDIA container toolkit configuration"));
  console.log(chalk.yellow("  • GPU mode switching scripts"));
  console.log();

  const proceed = await confirm({
    message: "Are you sure you want to uninstall?",
    default: false,
  });

  if (!proceed) {
    console.log(chalk.gray("\nUninstallation cancelled."));
    process.exit(0);
  }

  console.log();
  const spinner = ora("Uninstalling node components...").start();

  try {
    spinner.text = "Removing KubeVirt...";
    await runCommand(
      "kubectl",
      [
        "delete",
        "-f",
        "https://github.com/kubevirt/kubevirt/releases/download/v1.3.0/kubevirt-cr.yaml",
        "--ignore-not-found",
      ],
      { sudo: true },
    );
    await runCommand(
      "kubectl",
      [
        "delete",
        "-f",
        "https://github.com/kubevirt/kubevirt/releases/download/v1.3.0/kubevirt-operator.yaml",
        "--ignore-not-found",
      ],
      { sudo: true },
    );

    spinner.text = "Removing k3s...";
    if (existsSync("/usr/local/bin/k3s-uninstall.sh")) {
      await runCommand("/usr/local/bin/k3s-uninstall.sh", [], { sudo: true });
    }

    spinner.text = "Removing GPU scripts...";
    const gpuScripts = [
      "/usr/local/bin/gpu-mode-nvidia",
      "/usr/local/bin/gpu-mode-vfio",
      "/usr/local/bin/gpu-mode-status",
    ];
    for (const script of gpuScripts) {
      if (existsSync(script)) {
        await runCommand("rm", ["-f", script], { sudo: true });
      }
    }

    spinner.text = "Removing runc symlink...";
    if (existsSync("/usr/local/bin/runc")) {
      await runCommand("rm", ["-f", "/usr/local/bin/runc"], { sudo: true });
    }

    spinner.text = "Removing CDI config...";
    if (existsSync("/etc/cdi/nvidia.yaml")) {
      await runCommand("rm", ["-f", "/etc/cdi/nvidia.yaml"], { sudo: true });
    }

    spinner.text = "Removing node config...";
    if (existsSync(NODE_CONFIG_DIR)) {
      rmSync(NODE_CONFIG_DIR, { recursive: true, force: true });
    }

    spinner.succeed("Node uninstalled successfully");
    console.log();
    console.log(
      chalk.gray("Note: nvidia-container-toolkit package was not removed."),
    );
    console.log(
      chalk.gray(
        "Run 'sudo apt remove nvidia-container-toolkit' to remove it.",
      ),
    );
    console.log();
  } catch (error: any) {
    spinner.fail(`Uninstallation failed: ${error.message}`);
    process.exit(1);
  }
}

async function nodeStatus(): Promise<void> {
  console.log(chalk.bold("\n📊 uvacompute Node Status\n"));

  const config = loadNodeConfig();
  const state = loadNodeState();

  console.log(chalk.underline("Installation State:"));
  if (state?.installed) {
    console.log(chalk.green("  ✓ Node is installed"));
    if (config?.install_date) {
      console.log(chalk.gray(`    Installed: ${config.install_date}`));
    }
  } else {
    console.log(chalk.yellow("  ✗ Node is not installed"));
    console.log(chalk.gray("    Run 'uva node install' to install"));
    console.log();
    return;
  }

  console.log();
  console.log(chalk.underline("k3s (Kubernetes):"));
  const spinner = ora({ text: "Checking k3s...", indent: 2 }).start();

  const k3s = await checkK3sStatus();
  if (k3s.running) {
    spinner.succeed(
      chalk.green(`Running${k3s.version ? ` (${k3s.version})` : ""}`),
    );
  } else {
    spinner.fail(chalk.red("Not running"));
  }

  console.log();
  console.log(chalk.underline("KubeVirt:"));
  const kvSpinner = ora({ text: "Checking KubeVirt...", indent: 2 }).start();

  const kubevirt = await checkKubeVirtStatus();
  if (kubevirt.installed) {
    if (kubevirt.phase === "Deployed") {
      kvSpinner.succeed(chalk.green(`Deployed`));
    } else {
      kvSpinner.warn(chalk.yellow(`Phase: ${kubevirt.phase}`));
    }
  } else {
    kvSpinner.fail(chalk.red("Not installed"));
  }

  console.log();
  console.log(chalk.underline("GPU:"));
  const gpuSpinner = ora({ text: "Checking GPU...", indent: 2 }).start();

  const gpu = await checkGpuStatus();
  if (gpu.detected) {
    gpuSpinner.succeed(chalk.green("NVIDIA GPU detected"));
    console.log(chalk.gray(`    Driver in use: ${gpu.driver}`));
    if (gpu.available) {
      console.log(chalk.green("    ✓ Available to Kubernetes"));
    } else {
      console.log(chalk.yellow("    ✗ Not available to Kubernetes"));
    }
    console.log();
    console.log(chalk.gray("  GPU mode commands:"));
    console.log(chalk.gray("    sudo gpu-mode-status  - Show current mode"));
    console.log(
      chalk.gray("    sudo gpu-mode-nvidia  - Switch to container mode"),
    );
    console.log(
      chalk.gray("    sudo gpu-mode-vfio    - Switch to VM passthrough mode"),
    );
  } else {
    gpuSpinner.info(chalk.gray("No NVIDIA GPU detected"));
  }

  console.log();
}

export function registerNodeCommands(program: Command) {
  const node = program
    .command("node")
    .description("Manage this machine as a uvacompute contributor node");

  node
    .command("install")
    .description("Install k3s, KubeVirt, and configure as a contributor node")
    .action(nodeInstall);

  node
    .command("uninstall")
    .description("Remove all node components installed by uva node install")
    .action(nodeUninstall);

  node
    .command("status")
    .description("Show current node status including k3s, KubeVirt, and GPU")
    .action(nodeStatus);
}
