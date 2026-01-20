import type { Command } from "commander";
import ora from "ora";
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { confirm, input, select } from "@inquirer/prompts";
import { spawn } from "child_process";
import {
  NODE_CONFIG_DIR,
  NODE_CONFIG_FILE,
  NODE_STATE_FILE,
  PREPARE_STATE_FILE,
  INSTALL_SCRIPT_URL,
  PROD_SITE_URL,
  DEV_SITE_URL,
} from "./lib/constants";
import { theme } from "./lib/theme";
import { loadToken } from "./lib/utils";
import chalk from "chalk";
import yaml from "js-yaml";

interface SharingConfig {
  cpus: number;
  ram: number;
  gpus: number;
  gpu_mode: "container" | "none";
}

interface NodeConfig {
  node_id?: string;
  install_date?: string;
  k3s_version?: string;
  kubevirt_version?: string;
  sharing?: SharingConfig;
}

interface NodeState {
  installed: boolean;
  components?: string[];
  gpu_detected?: boolean;
  gpu_pci?: string;
  gpu_audio_pci?: string;
  gpu_device_id?: string;
}

interface PrepareState {
  prepared: boolean;
  prepare_date?: string;
  os_id?: string;
  os_version?: string;
  gpu_detected?: boolean;
  driver_installed?: boolean;
  driver_version?: string;
  iommu_enabled?: boolean;
  iommu_gpu_isolated?: boolean;
  reboot_required?: boolean;
}

interface OSInfo {
  id: string;
  name: string;
  version?: string;
}

interface IOMMUStatus {
  enabled: boolean;
  groupCount: number;
  gpuIsolated: boolean;
  cpuVendor: "amd" | "intel" | "unknown";
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

function loadPrepareState(): PrepareState | null {
  try {
    if (!existsSync(PREPARE_STATE_FILE)) {
      return null;
    }
    const content = readFileSync(PREPARE_STATE_FILE, "utf8");
    return yaml.load(content) as PrepareState;
  } catch {
    return null;
  }
}

function savePrepareState(state: PrepareState): void {
  mkdirSync(NODE_CONFIG_DIR, { recursive: true });
  writeFileSync(PREPARE_STATE_FILE, yaml.dump(state), "utf8");
}

function detectOS(): OSInfo | null {
  try {
    if (!existsSync("/etc/os-release")) {
      return null;
    }
    const content = readFileSync("/etc/os-release", "utf8");
    const lines = content.split("\n");
    const values: Record<string, string> = {};

    for (const line of lines) {
      const match = line.match(/^([A-Z_]+)=(.*)$/);
      if (match && match[1] && match[2] !== undefined) {
        let value = match[2];
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        values[match[1]] = value;
      }
    }

    return {
      id: values.ID || "unknown",
      name: values.PRETTY_NAME || values.NAME || "Unknown",
      version: values.VERSION_ID,
    };
  } catch {
    return null;
  }
}

async function checkNvidiaSmi(): Promise<{
  works: boolean;
  version?: string;
  gpuName?: string;
}> {
  try {
    const result = await runCommand(
      "nvidia-smi",
      ["--query-gpu=driver_version,name", "--format=csv,noheader,nounits"],
      { silent: true },
    );
    if (result.exitCode === 0 && result.stdout.trim()) {
      const parts = result.stdout.trim().split(", ");
      return {
        works: true,
        version: parts[0],
        gpuName: parts[1],
      };
    }
  } catch {}
  return { works: false };
}

async function checkNvidiaGpu(): Promise<{
  detected: boolean;
  pciAddress?: string;
  deviceId?: string;
}> {
  try {
    const result = await runCommand("lspci", ["-nn"], { silent: true });
    if (result.exitCode === 0) {
      const lines = result.stdout.split("\n");
      for (const line of lines) {
        if (
          line.toLowerCase().includes("nvidia") &&
          line.toLowerCase().includes("vga")
        ) {
          const pciMatch = line.match(/^([0-9a-f:.]+)/i);
          const deviceMatch = line.match(/\[10de:([0-9a-f]+)\]/i);
          return {
            detected: true,
            pciAddress: pciMatch?.[1],
            deviceId: deviceMatch ? `10de:${deviceMatch[1]}` : undefined,
          };
        }
      }
    }
  } catch {}
  return { detected: false };
}

async function checkIOMMU(): Promise<IOMMUStatus> {
  const result: IOMMUStatus = {
    enabled: false,
    groupCount: 0,
    gpuIsolated: false,
    cpuVendor: "unknown",
  };

  try {
    if (existsSync("/proc/cpuinfo")) {
      const cpuinfo = readFileSync("/proc/cpuinfo", "utf8");
      if (cpuinfo.includes("AuthenticAMD") || cpuinfo.includes("AMD")) {
        result.cpuVendor = "amd";
      } else if (
        cpuinfo.includes("GenuineIntel") ||
        cpuinfo.includes("Intel")
      ) {
        result.cpuVendor = "intel";
      }
    }

    const iommuPath = "/sys/kernel/iommu_groups";
    if (existsSync(iommuPath)) {
      const findResult = await runCommand(
        "bash",
        ["-c", `find ${iommuPath} -maxdepth 1 -type d | wc -l`],
        { silent: true },
      );
      if (findResult.exitCode === 0) {
        const count = parseInt(findResult.stdout.trim(), 10) - 1;
        if (count > 0) {
          result.enabled = true;
          result.groupCount = count;

          const gpuGroupResult = await runCommand(
            "bash",
            [
              "-c",
              `find ${iommuPath} -type l | xargs -I {} sh -c 'ls -la {} 2>/dev/null' | grep -i nvidia | head -1`,
            ],
            { silent: true },
          );
          if (gpuGroupResult.exitCode === 0 && gpuGroupResult.stdout.trim()) {
            const groupMatch =
              gpuGroupResult.stdout.match(/iommu_groups\/(\d+)/);
            if (groupMatch) {
              const groupNum = groupMatch[1];
              const devicesResult = await runCommand(
                "bash",
                ["-c", `ls ${iommuPath}/${groupNum}/devices/ | wc -l`],
                { silent: true },
              );
              if (devicesResult.exitCode === 0) {
                const deviceCount = parseInt(devicesResult.stdout.trim(), 10);
                result.gpuIsolated = deviceCount <= 2;
              }
            }
          }
        }
      }
    }
  } catch {}

  return result;
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
  options?: { sudo?: boolean; silent?: boolean },
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const cmd = options?.sudo ? "sudo" : command;
    const cmdArgs = options?.sudo ? [command, ...args] : args;
    const silent = options?.silent ?? false;

    const proc = spawn(cmd, cmdArgs, {
      stdio: ["inherit", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
      if (!silent) {
        process.stdout.write(data);
      }
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
      if (!silent) {
        process.stderr.write(data);
      }
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

async function nodePrepare(options: {
  check?: boolean;
  skipIommu?: boolean;
}): Promise<void> {
  const isCheck = options.check ?? false;

  console.log(chalk.bold("\n🔧 uvacompute Node Preparation\n"));

  if (isCheck) {
    console.log(
      chalk.cyan("Running in check mode (no changes will be made)\n"),
    );
  }

  const os = detectOS();
  if (!os) {
    console.log(chalk.red("✗ Could not detect operating system"));
    console.log(chalk.gray("  /etc/os-release not found"));
    process.exit(1);
  }

  console.log(chalk.underline("Operating System:"));
  console.log(chalk.green(`  ✓ ${os.name}`));
  if (os.version) {
    console.log(chalk.gray(`    Version: ${os.version}`));
  }
  console.log(chalk.gray(`    ID: ${os.id}`));

  const supportedDistros = ["ubuntu", "debian", "arch", "fedora", "gentoo"];
  const isSupported = supportedDistros.includes(os.id);
  if (!isSupported) {
    console.log(
      chalk.yellow(`\n⚠ ${os.id} is not a fully supported distribution`),
    );
    console.log(chalk.gray("  Driver installation guidance may be limited"));
  }

  console.log();
  console.log(chalk.underline("GPU Detection:"));
  const spinner = ora({
    text: "Checking for NVIDIA GPU...",
    indent: 2,
  }).start();

  const gpu = await checkNvidiaGpu();
  if (!gpu.detected) {
    spinner.info(chalk.gray("No NVIDIA GPU detected"));
    console.log(chalk.gray("  GPU preparation not required"));

    if (!options.skipIommu) {
      console.log();
      await checkAndReportIOMMU(isCheck);
    }

    if (!isCheck) {
      savePrepareState({
        prepared: true,
        prepare_date: new Date().toISOString(),
        os_id: os.id,
        os_version: os.version,
        gpu_detected: false,
        driver_installed: false,
        reboot_required: false,
      });
      console.log(chalk.gray("\n  Prepare state saved."));
    }

    console.log(chalk.green("\n✓ System preparation complete (no GPU)"));
    console.log(chalk.gray("  You can now run 'uva node install'"));
    return;
  }

  spinner.succeed(chalk.green("NVIDIA GPU detected"));
  console.log(chalk.gray(`    PCI: ${gpu.pciAddress || "unknown"}`));
  if (gpu.deviceId) {
    console.log(chalk.gray(`    Device ID: ${gpu.deviceId}`));
  }

  console.log();
  console.log(chalk.underline("Driver Status:"));
  const driverSpinner = ora({
    text: "Checking nvidia-smi...",
    indent: 2,
  }).start();

  const driver = await checkNvidiaSmi();
  let driverInstalled = false;
  let rebootRequired = false;

  if (driver.works) {
    driverSpinner.succeed(chalk.green("NVIDIA driver is loaded"));
    console.log(chalk.gray(`    Version: ${driver.version}`));
    if (driver.gpuName) {
      console.log(chalk.gray(`    GPU: ${driver.gpuName}`));
    }
    driverInstalled = true;
  } else {
    driverSpinner.warn(chalk.yellow("NVIDIA driver not loaded"));

    if (isCheck) {
      console.log(
        chalk.cyan("\n  [CHECK] Would install NVIDIA driver for " + os.id),
      );
      printDriverInstructions(os.id);
    } else {
      const shouldInstall = await confirm({
        message: "Do you want to install the NVIDIA driver?",
        default: true,
      });

      if (shouldInstall) {
        const installResult = await installNvidiaDriver(os.id);
        if (installResult.success) {
          driverInstalled = true;
          rebootRequired = true;
          console.log(chalk.green("\n  ✓ Driver installation initiated"));
          console.log(chalk.yellow("  ⚠ Reboot required to load the driver"));
        } else {
          console.log(chalk.red("\n  ✗ Driver installation failed"));
          if (installResult.message) {
            console.log(chalk.gray(`    ${installResult.message}`));
          }
        }
      } else {
        console.log(chalk.gray("\n  Driver installation skipped"));
        printDriverInstructions(os.id);
      }
    }
  }

  if (!options.skipIommu) {
    console.log();
    await checkAndReportIOMMU(isCheck);
  }

  if (!isCheck) {
    const iommu = await checkIOMMU();
    savePrepareState({
      prepared: true,
      prepare_date: new Date().toISOString(),
      os_id: os.id,
      os_version: os.version,
      gpu_detected: true,
      driver_installed: driverInstalled,
      driver_version: driver.version,
      iommu_enabled: iommu.enabled,
      iommu_gpu_isolated: iommu.gpuIsolated,
      reboot_required: rebootRequired,
    });
    console.log(chalk.gray("\n  Prepare state saved."));
  }

  console.log();
  if (rebootRequired) {
    console.log(
      chalk.yellow("⚠ Please reboot your system, then run 'uva node install'"),
    );
  } else if (driverInstalled) {
    console.log(chalk.green("✓ System is prepared for node installation"));
    console.log(chalk.gray("  Run 'uva node install' to continue"));
  } else {
    console.log(chalk.yellow("⚠ Driver not installed"));
    console.log(
      chalk.gray(
        "  Install the driver manually, reboot, then run 'uva node install'",
      ),
    );
  }
  console.log();
}

async function checkAndReportIOMMU(isCheck: boolean): Promise<void> {
  console.log(chalk.underline("IOMMU Status:"));
  const iommuSpinner = ora({ text: "Checking IOMMU...", indent: 2 }).start();

  const iommu = await checkIOMMU();

  if (iommu.enabled) {
    iommuSpinner.succeed(
      chalk.green(`IOMMU enabled (${iommu.groupCount} groups)`),
    );
    console.log(chalk.gray(`    CPU: ${iommu.cpuVendor.toUpperCase()}`));
    if (iommu.gpuIsolated) {
      console.log(chalk.green("    ✓ GPU is in isolated IOMMU group"));
    } else {
      console.log(
        chalk.yellow("    ⚠ GPU may share IOMMU group with other devices"),
      );
      console.log(chalk.gray("      This could affect GPU passthrough"));
    }
  } else {
    iommuSpinner.warn(chalk.yellow("IOMMU not enabled"));
    console.log(chalk.gray("    GPU passthrough requires IOMMU"));
    console.log();
    console.log(chalk.gray("  To enable IOMMU:"));
    console.log(
      chalk.gray("    1. Enable VT-d (Intel) or AMD-Vi (AMD) in BIOS"),
    );
    console.log(chalk.gray("    2. Add kernel parameter to GRUB:"));
    if (iommu.cpuVendor === "intel") {
      console.log(chalk.cyan('       GRUB_CMDLINE_LINUX="intel_iommu=on"'));
    } else if (iommu.cpuVendor === "amd") {
      console.log(chalk.cyan('       GRUB_CMDLINE_LINUX="amd_iommu=on"'));
    } else {
      console.log(
        chalk.cyan('       GRUB_CMDLINE_LINUX="intel_iommu=on"  (Intel)'),
      );
      console.log(
        chalk.cyan('       GRUB_CMDLINE_LINUX="amd_iommu=on"   (AMD)'),
      );
    }
    console.log(chalk.gray("    3. Run: sudo update-grub && sudo reboot"));
  }
}

function printDriverInstructions(osId: string): void {
  console.log(chalk.gray("\n  Manual installation instructions:"));

  switch (osId) {
    case "ubuntu":
    case "debian":
      console.log(chalk.cyan("    sudo ubuntu-drivers autoinstall"));
      console.log(chalk.gray("    # Or for a specific version:"));
      console.log(chalk.cyan("    ubuntu-drivers devices"));
      console.log(chalk.cyan("    sudo apt install nvidia-driver-XXX"));
      break;
    case "arch":
      console.log(chalk.cyan("    sudo pacman -S nvidia nvidia-utils"));
      console.log(
        chalk.gray("    # For newer GPUs (RTX 30+), use open driver:"),
      );
      console.log(chalk.cyan("    sudo pacman -S nvidia-open nvidia-utils"));
      break;
    case "fedora":
      console.log(chalk.gray("    # First, enable RPM Fusion:"));
      console.log(
        chalk.cyan(
          "    sudo dnf install https://mirrors.rpmfusion.org/free/fedora/rpmfusion-free-release-$(rpm -E %fedora).noarch.rpm",
        ),
      );
      console.log(
        chalk.cyan(
          "    sudo dnf install https://mirrors.rpmfusion.org/nonfree/fedora/rpmfusion-nonfree-release-$(rpm -E %fedora).noarch.rpm",
        ),
      );
      console.log(chalk.gray("    # Then install driver:"));
      console.log(chalk.cyan("    sudo dnf install akmod-nvidia"));
      break;
    case "gentoo":
      console.log(
        chalk.cyan("    sudo emerge --ask x11-drivers/nvidia-drivers"),
      );
      console.log(chalk.gray("    # May require kernel configuration"));
      break;
    default:
      console.log(
        chalk.gray(
          "    Please install the NVIDIA driver for your distribution",
        ),
      );
      console.log(chalk.gray("    Consult your distribution's documentation"));
  }

  console.log(chalk.gray("\n  After installation, reboot your system."));
}

async function installNvidiaDriver(
  osId: string,
): Promise<{ success: boolean; message?: string }> {
  switch (osId) {
    case "ubuntu":
    case "debian": {
      console.log(chalk.gray("\n  Running: sudo ubuntu-drivers autoinstall"));
      const result = await runCommand("ubuntu-drivers", ["autoinstall"], {
        sudo: true,
      });
      if (result.exitCode === 0) {
        return { success: true };
      }
      return {
        success: false,
        message: "ubuntu-drivers autoinstall failed",
      };
    }

    case "arch":
      console.log(
        chalk.yellow("\n  Arch Linux requires manual driver installation:"),
      );
      printDriverInstructions("arch");
      return {
        success: false,
        message: "Please install manually and reboot",
      };

    case "fedora":
      console.log(chalk.yellow("\n  Fedora requires RPM Fusion setup:"));
      printDriverInstructions("fedora");
      return {
        success: false,
        message: "Please install manually and reboot",
      };

    case "gentoo":
      console.log(
        chalk.yellow("\n  Gentoo requires manual driver installation:"),
      );
      printDriverInstructions("gentoo");
      return {
        success: false,
        message: "Please install manually and reboot",
      };

    default:
      console.log(
        chalk.yellow("\n  Unsupported distribution for automatic installation"),
      );
      return {
        success: false,
        message: `Automatic installation not supported for ${osId}`,
      };
  }
}

async function nodeInstall(): Promise<void> {
  console.log(chalk.bold("\n🚀 uvacompute Node Installation\n"));

  const gpu = await checkNvidiaGpu();
  if (gpu.detected) {
    const driver = await checkNvidiaSmi();
    if (!driver.works) {
      console.log(chalk.yellow("⚠ NVIDIA GPU detected but driver not loaded"));
      console.log();
      console.log(
        chalk.gray(
          "The driver must be installed and loaded before proceeding.",
        ),
      );
      console.log(chalk.gray("Run the following commands:"));
      console.log();
      console.log(chalk.cyan("  uva node prepare"));
      console.log(chalk.gray("  # Reboot your system"));
      console.log(chalk.cyan("  uva node install"));
      console.log();
      process.exit(1);
    }
  }

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
  const isAgentMode =
    (state as any)?.install_mode === "agent" ||
    existsSync("/usr/local/bin/k3s-agent-uninstall.sh");

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
  if (isAgentMode) {
    console.log(chalk.yellow("  • k3s agent"));
    console.log(chalk.yellow("  • SSH tunnel service"));
  } else {
    console.log(chalk.yellow("  • k3s server and all Kubernetes resources"));
    console.log(chalk.yellow("  • KubeVirt"));
  }
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
    // For standalone server mode, remove KubeVirt first
    if (!isAgentMode) {
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
    }

    // Stop and remove SSH tunnel service (agent mode)
    spinner.text = "Stopping SSH tunnel service...";
    await runCommand("systemctl", ["stop", "uvacompute-tunnel"], {
      sudo: true,
    }).catch(() => {});
    await runCommand("systemctl", ["disable", "uvacompute-tunnel"], {
      sudo: true,
    }).catch(() => {});
    if (existsSync("/etc/systemd/system/uvacompute-tunnel.service")) {
      await runCommand(
        "rm",
        ["-f", "/etc/systemd/system/uvacompute-tunnel.service"],
        { sudo: true },
      );
    }
    await runCommand("systemctl", ["daemon-reload"], { sudo: true }).catch(
      () => {},
    );

    // Remove k3s (agent or server)
    spinner.text = "Removing k3s...";
    if (existsSync("/usr/local/bin/k3s-agent-uninstall.sh")) {
      await runCommand("/usr/local/bin/k3s-agent-uninstall.sh", [], {
        sudo: true,
      });
    } else if (existsSync("/usr/local/bin/k3s-uninstall.sh")) {
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

    // Remove /opt/uvacompute directory (agent mode config)
    spinner.text = "Removing uvacompute config...";
    if (existsSync("/opt/uvacompute")) {
      await runCommand("rm", ["-rf", "/opt/uvacompute"], { sudo: true });
    }

    // Also remove old /opt/vm-orchestration-service if it exists (legacy)
    if (existsSync("/opt/vm-orchestration-service")) {
      await runCommand("rm", ["-rf", "/opt/vm-orchestration-service"], {
        sudo: true,
      });
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

function getUserKubeconfig(): string | null {
  const homedir = process.env.HOME || "/root";
  const userKubeconfig = `${homedir}/.kube/config`;
  if (existsSync(userKubeconfig)) {
    return userKubeconfig;
  }
  return null;
}

async function runKubectl(
  args: string[],
  options?: { silent?: boolean },
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const userKubeconfig = getUserKubeconfig();

  if (userKubeconfig) {
    const result = await runCommand(
      "kubectl",
      ["--kubeconfig", userKubeconfig, ...args],
      { silent: options?.silent ?? true },
    );
    if (result.exitCode === 0) {
      return result;
    }
  }

  const result = await runCommand("kubectl", args, {
    sudo: true,
    silent: options?.silent ?? true,
  });
  return result;
}

async function getK3sNodeName(): Promise<string | null> {
  try {
    const result = await runKubectl([
      "get",
      "nodes",
      "-o",
      "jsonpath={.items[0].metadata.name}",
    ]);
    if (result.exitCode === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
  } catch {}
  return null;
}

async function isNodePaused(): Promise<boolean> {
  try {
    const nodeName = await getK3sNodeName();
    if (!nodeName) return false;

    const result = await runKubectl([
      "get",
      "node",
      nodeName,
      "-o",
      "jsonpath={.spec.unschedulable}",
    ]);
    return result.stdout.trim() === "true";
  } catch {}
  return false;
}

interface WorkloadInfo {
  name: string;
  status: string;
}

interface Workloads {
  vms: WorkloadInfo[];
  jobs: WorkloadInfo[];
}

async function getWorkloads(): Promise<Workloads> {
  const result: Workloads = { vms: [], jobs: [] };

  try {
    const vmiResult = await runKubectl([
      "get",
      "vmi",
      "-n",
      "uvacompute",
      "-o",
      'jsonpath={range .items[*]}{.metadata.name},{.status.phase}{"\\n"}{end}',
    ]);
    if (vmiResult.exitCode === 0 && vmiResult.stdout.trim()) {
      const lines = vmiResult.stdout.trim().split("\n");
      for (const line of lines) {
        const [name, status] = line.split(",");
        if (name) {
          result.vms.push({ name, status: status || "Unknown" });
        }
      }
    }
  } catch {}

  try {
    const jobResult = await runKubectl([
      "get",
      "jobs",
      "-n",
      "uvacompute",
      "-o",
      'jsonpath={range .items[*]}{.metadata.name},{.status.conditions[0].type}{"\\n"}{end}',
    ]);
    if (jobResult.exitCode === 0 && jobResult.stdout.trim()) {
      const lines = jobResult.stdout.trim().split("\n");
      for (const line of lines) {
        const [name, status] = line.split(",");
        if (name) {
          result.jobs.push({ name, status: status || "Running" });
        }
      }
    }
  } catch {}

  return result;
}

interface SystemResources {
  cpus: number;
  ramGb: number;
  gpuCount: number;
}

async function getSystemResources(): Promise<SystemResources> {
  let cpus = 1;
  let ramGb = 4;
  let gpuCount = 0;

  try {
    const cpuResult = await runCommand("nproc", [], { silent: true });
    if (cpuResult.exitCode === 0) {
      cpus = parseInt(cpuResult.stdout.trim(), 10) || 1;
    }
  } catch {}

  try {
    const memResult = await runCommand(
      "bash",
      ["-c", "grep MemTotal /proc/meminfo | awk '{print int($2/1024/1024)}'"],
      { silent: true },
    );
    if (memResult.exitCode === 0) {
      ramGb = parseInt(memResult.stdout.trim(), 10) || 4;
    }
  } catch {}

  const gpu = await checkNvidiaGpu();
  if (gpu.detected) {
    gpuCount = 1;
  }

  return { cpus, ramGb, gpuCount };
}

function saveNodeConfig(config: NodeConfig): void {
  mkdirSync(NODE_CONFIG_DIR, { recursive: true });
  writeFileSync(NODE_CONFIG_FILE, yaml.dump(config), "utf8");
}

async function nodeConfig(): Promise<void> {
  console.log(chalk.bold("\n⚙️  Node Configuration\n"));

  const state = loadNodeState();
  if (!state?.installed) {
    console.log(chalk.red("✗ Node is not installed"));
    console.log(chalk.gray("  Run 'uva node install' first"));
    process.exit(1);
  }

  const spinner = ora("Detecting system resources...").start();
  const resources = await getSystemResources();
  spinner.succeed("System resources detected");

  console.log(chalk.gray(`  CPUs: ${resources.cpus}`));
  console.log(chalk.gray(`  RAM: ${resources.ramGb} GB`));
  console.log(
    chalk.gray(
      `  GPUs: ${resources.gpuCount > 0 ? resources.gpuCount : "None"}`,
    ),
  );
  console.log();

  const currentConfig = loadNodeConfig();
  const currentSharing = currentConfig?.sharing;

  console.log(chalk.underline("Configure Resource Sharing"));
  console.log(
    chalk.gray(
      "Specify how many resources to share with the uvacompute network.\n",
    ),
  );

  const cpuInput = await input({
    message: `CPUs to share (1-${resources.cpus})`,
    default: String(currentSharing?.cpus ?? Math.max(1, resources.cpus - 1)),
    validate: (value) => {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 1 || num > resources.cpus) {
        return `Please enter a number between 1 and ${resources.cpus}`;
      }
      return true;
    },
  });

  const ramInput = await input({
    message: `RAM to share in GB (1-${resources.ramGb})`,
    default: String(currentSharing?.ram ?? Math.max(1, resources.ramGb - 4)),
    validate: (value) => {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 1 || num > resources.ramGb) {
        return `Please enter a number between 1 and ${resources.ramGb}`;
      }
      return true;
    },
  });

  let gpuMode: "container" | "none" = "none";
  let gpuCount = 0;

  if (resources.gpuCount > 0) {
    const gpuModeChoice = await select({
      message: "GPU sharing mode",
      choices: [
        {
          value: "container",
          name: "Container mode - Share GPU with container workloads",
        },
        {
          value: "none",
          name: "None - Do not share GPU",
        },
      ],
      default: currentSharing?.gpu_mode ?? "container",
    });
    gpuMode = gpuModeChoice as "container" | "none";
    gpuCount = gpuMode === "container" ? resources.gpuCount : 0;
  }

  const newSharing: SharingConfig = {
    cpus: parseInt(cpuInput, 10),
    ram: parseInt(ramInput, 10),
    gpus: gpuCount,
    gpu_mode: gpuMode,
  };

  console.log();
  console.log(chalk.underline("Configuration Summary:"));
  console.log(chalk.gray(`  CPUs: ${newSharing.cpus}`));
  console.log(chalk.gray(`  RAM: ${newSharing.ram} GB`));
  console.log(chalk.gray(`  GPUs: ${newSharing.gpus}`));
  console.log(chalk.gray(`  GPU Mode: ${newSharing.gpu_mode}`));
  console.log();

  const shouldSave = await confirm({
    message: "Save this configuration?",
    default: true,
  });

  if (!shouldSave) {
    console.log(chalk.gray("\nConfiguration cancelled."));
    return;
  }

  const updatedConfig: NodeConfig = {
    ...currentConfig,
    sharing: newSharing,
  };

  saveNodeConfig(updatedConfig);

  console.log(chalk.green("\n✓ Configuration saved"));
  console.log(chalk.gray(`  Config file: ${NODE_CONFIG_FILE}`));
  console.log();
}

async function nodePause(): Promise<void> {
  console.log(chalk.bold("\n⏸️  Pausing Node\n"));

  const state = loadNodeState();
  if (!state?.installed) {
    console.log(chalk.red("✗ Node is not installed"));
    console.log(chalk.gray("  Run 'uva node install' first"));
    process.exit(1);
  }

  const nodeName = await getK3sNodeName();
  if (!nodeName) {
    console.log(chalk.red("✗ Could not get node name"));
    console.log(chalk.gray("  Is k3s running? Try 'uva node status'"));
    process.exit(1);
  }

  const alreadyPaused = await isNodePaused();
  if (alreadyPaused) {
    console.log(chalk.yellow("Node is already paused"));
    console.log(
      chalk.gray("  Run 'uva node resume' to accept workloads again"),
    );
    return;
  }

  const spinner = ora(`Cordoning node ${nodeName}...`).start();

  const result = await runKubectl(["cordon", nodeName]);

  if (result.exitCode !== 0) {
    spinner.fail("Failed to pause node");
    console.log(chalk.red(result.stderr));
    process.exit(1);
  }

  spinner.succeed(chalk.green(`Node ${nodeName} is now paused`));
  console.log();
  console.log(chalk.gray("The node will no longer accept new workloads."));
  console.log(chalk.gray("Existing workloads will continue running."));
  console.log(chalk.gray("Run 'uva node resume' to accept workloads again."));
  console.log();
}

async function nodeResume(): Promise<void> {
  console.log(chalk.bold("\n▶️  Resuming Node\n"));

  const state = loadNodeState();
  if (!state?.installed) {
    console.log(chalk.red("✗ Node is not installed"));
    console.log(chalk.gray("  Run 'uva node install' first"));
    process.exit(1);
  }

  const nodeName = await getK3sNodeName();
  if (!nodeName) {
    console.log(chalk.red("✗ Could not get node name"));
    console.log(chalk.gray("  Is k3s running? Try 'uva node status'"));
    process.exit(1);
  }

  const isPaused = await isNodePaused();
  if (!isPaused) {
    console.log(chalk.yellow("Node is not paused"));
    console.log(chalk.gray("  The node is already accepting workloads"));
    return;
  }

  const spinner = ora(`Uncordoning node ${nodeName}...`).start();

  const result = await runKubectl(["uncordon", nodeName]);

  if (result.exitCode !== 0) {
    spinner.fail("Failed to resume node");
    console.log(chalk.red(result.stderr));
    process.exit(1);
  }

  spinner.succeed(chalk.green(`Node ${nodeName} is now accepting workloads`));
  console.log();
}

async function nodeStatus(): Promise<void> {
  console.log(chalk.bold("\n📊 uvacompute Node Status\n"));

  const config = loadNodeConfig();
  const state = loadNodeState();
  const prepareState = loadPrepareState();

  console.log(chalk.underline("Preparation State:"));
  if (prepareState?.prepared) {
    console.log(chalk.green("  ✓ System is prepared"));
    if (prepareState.prepare_date) {
      console.log(chalk.gray(`    Prepared: ${prepareState.prepare_date}`));
    }
    if (prepareState.os_id) {
      console.log(
        chalk.gray(
          `    OS: ${prepareState.os_id}${prepareState.os_version ? ` ${prepareState.os_version}` : ""}`,
        ),
      );
    }
    if (prepareState.gpu_detected) {
      console.log(
        chalk.gray(
          `    GPU: Detected${prepareState.driver_installed ? `, driver ${prepareState.driver_version || "installed"}` : ", driver not installed"}`,
        ),
      );
    }
    if (prepareState.iommu_enabled !== undefined) {
      console.log(
        chalk.gray(
          `    IOMMU: ${prepareState.iommu_enabled ? "Enabled" : "Not enabled"}${prepareState.iommu_gpu_isolated ? ", GPU isolated" : ""}`,
        ),
      );
    }
    if (prepareState.reboot_required) {
      console.log(chalk.yellow("    ⚠ Reboot required before installation"));
    }
  } else {
    console.log(chalk.gray("  ○ Not prepared"));
    console.log(chalk.gray("    Run 'uva node prepare' to prepare the system"));
  }

  console.log();
  console.log(chalk.underline("Installation State:"));
  if (state?.installed) {
    console.log(chalk.green("  ✓ Node is installed"));
    if (config?.install_date) {
      console.log(chalk.gray(`    Installed: ${config.install_date}`));
    }
  } else {
    console.log(chalk.yellow("  ✗ Node is not installed"));
    if (prepareState?.prepared && !prepareState.reboot_required) {
      console.log(chalk.gray("    Run 'uva node install' to install"));
    } else if (prepareState?.reboot_required) {
      console.log(chalk.gray("    Reboot first, then run 'uva node install'"));
    } else {
      console.log(chalk.gray("    Run 'uva node prepare' first"));
    }
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
  console.log(chalk.underline("Node Scheduling:"));
  const schedSpinner = ora({
    text: "Checking scheduling status...",
    indent: 2,
  }).start();

  const paused = await isNodePaused();
  if (paused) {
    schedSpinner.warn(chalk.yellow("Paused (not accepting new workloads)"));
    console.log(chalk.gray("    Run 'uva node resume' to accept workloads"));
  } else {
    schedSpinner.succeed(chalk.green("Active (accepting workloads)"));
  }

  console.log();
  console.log(chalk.underline("Workloads:"));
  const workloadSpinner = ora({
    text: "Checking workloads...",
    indent: 2,
  }).start();

  const workloads = await getWorkloads();
  workloadSpinner.stop();

  if (workloads.vms.length === 0 && workloads.jobs.length === 0) {
    console.log(chalk.gray("  No active workloads"));
  } else {
    if (workloads.vms.length > 0) {
      console.log(chalk.gray(`  VMs: ${workloads.vms.length}`));
      for (const vm of workloads.vms) {
        console.log(chalk.gray(`    • ${vm.name} (${vm.status})`));
      }
    }
    if (workloads.jobs.length > 0) {
      console.log(chalk.gray(`  Jobs: ${workloads.jobs.length}`));
      for (const job of workloads.jobs) {
        console.log(chalk.gray(`    • ${job.name} (${job.status})`));
      }
    }
  }

  console.log();
}

interface TokenCreateResponse {
  token: string;
  assignedPort: number;
  expiresAt: number;
}

interface TokenListItem {
  token: string;
  assignedPort: number;
  expiresAt: number;
  used: boolean;
  usedByNodeId?: string;
  createdAt: number;
  expired: boolean;
}

async function nodeTokenCreate(options: { name?: string }): Promise<void> {
  console.log(chalk.bold("\n🔑 Create Node Registration Token\n"));

  const token = loadToken();
  if (!token) {
    console.log(chalk.red("✗ Not logged in"));
    console.log(chalk.gray("  Run 'uva login' first"));
    process.exit(1);
  }

  const spinner = ora("Creating registration token...").start();

  try {
    const baseUrl = getBaseUrl();

    const response = await fetch(`${baseUrl}/api/nodes/tokens`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: options.name,
      }),
    });

    if (!response.ok) {
      const errorBody = (await response
        .json()
        .catch(() => ({ error: "Unknown error" }))) as { error?: string };
      throw new Error(errorBody.error || `HTTP ${response.status}`);
    }

    const data = (await response.json()) as TokenCreateResponse;

    spinner.succeed("Registration token created!");
    console.log();
    console.log(chalk.underline("Token Details:"));
    console.log(chalk.gray(`  Token: ${chalk.cyan(data.token)}`));
    console.log(chalk.gray(`  Assigned Port: ${data.assignedPort}`));
    console.log(
      chalk.gray(`  Expires: ${new Date(data.expiresAt).toLocaleString()}`),
    );
    console.log();
    console.log(chalk.underline("Installation Command:"));
    console.log(
      chalk.cyan(
        `  curl -fsSL ${baseUrl}/install-node.sh | sudo bash -s -- --token ${data.token}`,
      ),
    );
    console.log();
    console.log(
      chalk.yellow(
        "⚠ This token can only be used once and expires in 24 hours.",
      ),
    );
    console.log();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    spinner.fail(`Failed to create token: ${message}`);
    process.exit(1);
  }
}

async function nodeTokenList(): Promise<void> {
  console.log(chalk.bold("\n📋 Node Registration Tokens\n"));

  const token = loadToken();
  if (!token) {
    console.log(chalk.red("✗ Not logged in"));
    console.log(chalk.gray("  Run 'uva login' first"));
    process.exit(1);
  }

  const spinner = ora("Fetching tokens...").start();

  try {
    const baseUrl = getBaseUrl();

    const response = await fetch(`${baseUrl}/api/nodes/tokens`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorBody = (await response
        .json()
        .catch(() => ({ error: "Unknown error" }))) as { error?: string };
      throw new Error(errorBody.error || `HTTP ${response.status}`);
    }

    const data = (await response.json()) as { tokens?: TokenListItem[] };
    const tokens = data.tokens || [];

    spinner.succeed(`Found ${tokens.length} tokens`);
    console.log();

    if (tokens.length === 0) {
      console.log(chalk.gray("  No tokens found"));
      console.log(chalk.gray("  Create one with 'uva node token create'"));
    } else {
      for (const token of tokens) {
        const statusColor = token.used
          ? chalk.gray
          : token.expired
            ? chalk.yellow
            : chalk.green;
        const status = token.used
          ? "[USED]"
          : token.expired
            ? "[EXPIRED]"
            : "[ACTIVE]";

        console.log(statusColor(`  ${status} Port ${token.assignedPort}`));
        console.log(chalk.gray(`    Token: ${token.token.substring(0, 8)}...`));
        console.log(
          chalk.gray(
            `    Created: ${new Date(token.createdAt).toLocaleString()}`,
          ),
        );
        if (token.usedByNodeId) {
          console.log(chalk.gray(`    Used by: ${token.usedByNodeId}`));
        }
        console.log();
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    spinner.fail(`Failed to fetch tokens: ${message}`);
    process.exit(1);
  }
}

export function registerNodeCommands(program: Command) {
  const node = program
    .command("node")
    .description("Manage this machine as a uvacompute contributor node");

  node
    .command("prepare")
    .description(
      "Prepare the system by installing NVIDIA drivers and checking IOMMU",
    )
    .option("--check", "Show what would be done without making changes")
    .option("--skip-iommu", "Skip IOMMU verification checks")
    .action((options) => nodePrepare(options));

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

  node
    .command("pause")
    .description("Stop accepting new workloads (existing workloads continue)")
    .action(nodePause);

  node
    .command("resume")
    .description("Resume accepting new workloads")
    .action(nodeResume);

  node
    .command("config")
    .description("Configure resource sharing settings interactively")
    .action(nodeConfig);

  // Token subcommands for admin use
  const token = node
    .command("token")
    .description("Manage node registration tokens (admin)");

  token
    .command("create")
    .description("Create a new node registration token")
    .option("-n, --name <name>", "Optional name/description for the token")
    .action(nodeTokenCreate);

  token
    .command("list")
    .description("List all registration tokens")
    .action(nodeTokenList);
}
