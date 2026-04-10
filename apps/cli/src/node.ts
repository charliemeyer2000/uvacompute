import type { Command } from "commander";
import ora from "ora";
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { confirm } from "./lib/prompt";
import { spawn } from "child_process";
import { createHmac } from "crypto";
import { hostname } from "os";
import {
  NODE_CONFIG_DIR,
  NODE_CONFIG_FILE,
  NODE_STATE_FILE,
  PREPARE_STATE_FILE,
  PROD_SITE_URL,
  DEV_SITE_URL,
} from "./lib/constants";
import { theme } from "./lib/theme";
import { loadToken } from "./lib/utils";
import yaml from "js-yaml";

interface RemoteNode {
  _id: string;
  nodeId: string;
  name?: string;
  status: "online" | "offline" | "draining";
  cpus?: number;
  ram?: number;
  gpus?: number;
  lastHeartbeat: number;
  registeredAt: number;
}

interface RemoteVM {
  vmId: string;
  name?: string;
  cpus: number;
  ram: number;
  gpus: number;
  status: string;
}

interface RemoteJob {
  jobId: string;
  name?: string;
  cpus: number;
  ram: number;
  gpus: number;
  status: string;
}

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
    const isSudo = options?.sudo ?? false;
    const cmd = isSudo ? "sudo" : command;
    const cmdArgs = isSudo
      ? ["--preserve-env=SUDO_USER", command, ...args]
      : args;
    const silent = options?.silent ?? false;

    // When the CLI itself is not running as root but needs sudo,
    // pass the current user as SUDO_USER so the install script
    // can save state to the correct home directory.
    const env = { ...process.env };
    if (isSudo && !process.env.SUDO_USER && process.getuid?.() !== 0) {
      env.SUDO_USER = process.env.USER || process.env.LOGNAME || "";
    }

    const proc = spawn(cmd, cmdArgs, {
      stdio: ["inherit", "pipe", "pipe"],
      env,
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

  console.log(theme.emphasis("\nNode Preparation\n"));

  if (isCheck) {
    console.log(
      theme.accent("Running in check mode (no changes will be made)\n"),
    );
  }

  const os = detectOS();
  if (!os) {
    console.log(theme.error("✗ Could not detect operating system"));
    console.log(theme.muted("  /etc/os-release not found"));
    process.exit(1);
  }

  console.log(theme.info("Operating System:"));
  console.log(theme.success(`  ✓ ${os.name}`));
  if (os.version) {
    console.log(theme.muted(`    Version: ${os.version}`));
  }
  console.log(theme.muted(`    ID: ${os.id}`));

  const supportedDistros = ["ubuntu", "debian", "arch", "fedora", "gentoo"];
  const isSupported = supportedDistros.includes(os.id);
  if (!isSupported) {
    console.log(
      theme.warning(`\n⚠ ${os.id} is not a fully supported distribution`),
    );
    console.log(theme.muted("  Driver installation guidance may be limited"));
  }

  console.log();
  console.log(theme.info("GPU Detection:"));
  const spinner = ora({
    text: "Checking for NVIDIA GPU...",
    indent: 2,
  }).start();

  const gpu = await checkNvidiaGpu();
  if (!gpu.detected) {
    spinner.info(theme.muted("No NVIDIA GPU detected"));
    console.log(theme.muted("  GPU preparation not required"));

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
      console.log(theme.muted("\n  Prepare state saved."));
    }

    console.log(theme.success("\n✓ System preparation complete (no GPU)"));
    console.log(theme.muted("  You can now run 'uva node install'"));
    return;
  }

  spinner.succeed(theme.success("NVIDIA GPU detected"));
  console.log(theme.muted(`    PCI: ${gpu.pciAddress || "unknown"}`));
  if (gpu.deviceId) {
    console.log(theme.muted(`    Device ID: ${gpu.deviceId}`));
  }

  console.log();
  console.log(theme.info("Driver Status:"));
  const driverSpinner = ora({
    text: "Checking nvidia-smi...",
    indent: 2,
  }).start();

  const driver = await checkNvidiaSmi();
  let driverInstalled = false;
  let rebootRequired = false;

  if (driver.works) {
    driverSpinner.succeed(theme.success("NVIDIA driver is loaded"));
    console.log(theme.muted(`    Version: ${driver.version}`));
    if (driver.gpuName) {
      console.log(theme.muted(`    GPU: ${driver.gpuName}`));
    }
    driverInstalled = true;
  } else {
    driverSpinner.warn(theme.warning("NVIDIA driver not loaded"));

    if (isCheck) {
      console.log(
        theme.accent("\n  [CHECK] Would install NVIDIA driver for " + os.id),
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
          console.log(theme.success("\n  ✓ Driver installation initiated"));
          console.log(theme.warning("  ⚠ Reboot required to load the driver"));
        } else {
          console.log(theme.error("\n  ✗ Driver installation failed"));
          if (installResult.message) {
            console.log(theme.muted(`    ${installResult.message}`));
          }
        }
      } else {
        console.log(theme.muted("\n  Driver installation skipped"));
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
    console.log(theme.muted("\n  Prepare state saved."));
  }

  console.log();
  if (rebootRequired) {
    console.log(
      theme.warning(
        "⚠ Please reboot your system, then run 'uva node install'",
      ),
    );
  } else if (driverInstalled) {
    console.log(theme.success("✓ System is prepared for node installation"));
    console.log(theme.muted("  Run 'uva node install' to continue"));
  } else {
    console.log(theme.warning("⚠ Driver not installed"));
    console.log(
      theme.muted(
        "  Install the driver manually, reboot, then run 'uva node install'",
      ),
    );
  }
  console.log();
}

async function checkAndReportIOMMU(isCheck: boolean): Promise<void> {
  console.log(theme.info("IOMMU Status:"));
  const iommuSpinner = ora({ text: "Checking IOMMU...", indent: 2 }).start();

  const iommu = await checkIOMMU();

  if (iommu.enabled) {
    iommuSpinner.succeed(
      theme.success(`IOMMU enabled (${iommu.groupCount} groups)`),
    );
    console.log(theme.muted(`    CPU: ${iommu.cpuVendor.toUpperCase()}`));
    if (iommu.gpuIsolated) {
      console.log(theme.success("    ✓ GPU is in isolated IOMMU group"));
    } else {
      console.log(
        theme.warning("    ⚠ GPU may share IOMMU group with other devices"),
      );
      console.log(theme.muted("      This could affect GPU passthrough"));
    }
  } else {
    iommuSpinner.warn(theme.warning("IOMMU not enabled"));
    console.log(theme.muted("    GPU passthrough requires IOMMU"));
    console.log();
    console.log(theme.muted("  To enable IOMMU:"));
    console.log(
      theme.muted("    1. Enable VT-d (Intel) or AMD-Vi (AMD) in BIOS"),
    );
    console.log(theme.muted("    2. Add kernel parameter to GRUB:"));
    if (iommu.cpuVendor === "intel") {
      console.log(theme.accent('       GRUB_CMDLINE_LINUX="intel_iommu=on"'));
    } else if (iommu.cpuVendor === "amd") {
      console.log(theme.accent('       GRUB_CMDLINE_LINUX="amd_iommu=on"'));
    } else {
      console.log(
        theme.accent('       GRUB_CMDLINE_LINUX="intel_iommu=on"  (Intel)'),
      );
      console.log(
        theme.accent('       GRUB_CMDLINE_LINUX="amd_iommu=on"   (AMD)'),
      );
    }
    console.log(theme.muted("    3. Run: sudo update-grub && sudo reboot"));
  }
}

function printDriverInstructions(osId: string): void {
  console.log(theme.muted("\n  Manual installation instructions:"));

  switch (osId) {
    case "ubuntu":
    case "debian":
      console.log(theme.accent("    sudo ubuntu-drivers autoinstall"));
      console.log(theme.muted("    # Or for a specific version:"));
      console.log(theme.accent("    ubuntu-drivers devices"));
      console.log(theme.accent("    sudo apt install nvidia-driver-XXX"));
      break;
    case "arch":
      console.log(theme.accent("    sudo pacman -S nvidia nvidia-utils"));
      console.log(
        theme.muted("    # For newer GPUs (RTX 30+), use open driver:"),
      );
      console.log(theme.accent("    sudo pacman -S nvidia-open nvidia-utils"));
      break;
    case "fedora":
      console.log(theme.muted("    # First, enable RPM Fusion:"));
      console.log(
        theme.accent(
          "    sudo dnf install https://mirrors.rpmfusion.org/free/fedora/rpmfusion-free-release-$(rpm -E %fedora).noarch.rpm",
        ),
      );
      console.log(
        theme.accent(
          "    sudo dnf install https://mirrors.rpmfusion.org/nonfree/fedora/rpmfusion-nonfree-release-$(rpm -E %fedora).noarch.rpm",
        ),
      );
      console.log(theme.muted("    # Then install driver:"));
      console.log(theme.accent("    sudo dnf install akmod-nvidia"));
      break;
    case "gentoo":
      console.log(
        theme.accent("    sudo emerge --ask x11-drivers/nvidia-drivers"),
      );
      console.log(theme.muted("    # May require kernel configuration"));
      break;
    default:
      console.log(
        theme.muted(
          "    Please install the NVIDIA driver for your distribution",
        ),
      );
      console.log(theme.muted("    Consult your distribution's documentation"));
  }

  console.log(theme.muted("\n  After installation, reboot your system."));
}

async function installNvidiaDriver(
  osId: string,
): Promise<{ success: boolean; message?: string }> {
  switch (osId) {
    case "ubuntu":
    case "debian": {
      console.log(theme.muted("\n  Running: sudo ubuntu-drivers autoinstall"));
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
        theme.warning("\n  Arch Linux requires manual driver installation:"),
      );
      printDriverInstructions("arch");
      return {
        success: false,
        message: "Please install manually and reboot",
      };

    case "fedora": {
      // Check if RPM Fusion nonfree is enabled
      const repoCheck = await runCommand("dnf", ["repolist", "--enabled"], {
        sudo: true,
        silent: true,
      });

      if (!repoCheck.stdout.includes("rpmfusion-nonfree")) {
        console.log(
          theme.warning("\n  RPM Fusion nonfree repository required."),
        );
        printDriverInstructions("fedora");
        return { success: false, message: "Enable RPM Fusion first" };
      }

      console.log(theme.muted("\n  Running: sudo dnf install akmod-nvidia"));
      const result = await runCommand(
        "dnf",
        ["install", "-y", "akmod-nvidia"],
        {
          sudo: true,
        },
      );

      if (result.exitCode === 0) {
        console.log(
          theme.warning(
            "\n  Note: akmod-nvidia compiles on reboot. First boot may take 5-10 minutes.",
          ),
        );
        return { success: true };
      }
      return { success: false, message: "dnf install failed" };
    }

    case "gentoo":
      console.log(
        theme.warning("\n  Gentoo requires manual driver installation:"),
      );
      printDriverInstructions("gentoo");
      return {
        success: false,
        message: "Please install manually and reboot",
      };

    default:
      console.log(
        theme.warning(
          "\n  Unsupported distribution for automatic installation",
        ),
      );
      return {
        success: false,
        message: `Automatic installation not supported for ${osId}`,
      };
  }
}

async function nodeInstall(
  options: { cpus?: string; ram?: string; storage?: string } = {},
): Promise<void> {
  console.log(theme.emphasis("\nNode Installation\n"));

  const gpu = await checkNvidiaGpu();
  if (gpu.detected) {
    const driver = await checkNvidiaSmi();
    if (!driver.works) {
      console.log(
        theme.warning("⚠ NVIDIA GPU detected but driver not loaded"),
      );
      console.log();
      console.log(
        theme.muted(
          "The driver must be installed and loaded before proceeding.",
        ),
      );
      console.log(theme.muted("Run the following commands:"));
      console.log();
      console.log(theme.accent("  uva node prepare"));
      console.log(theme.muted("  # Reboot your system"));
      console.log(theme.accent("  uva node install"));
      console.log();
      process.exit(1);
    }
  }

  const state = loadNodeState();
  if (state?.installed) {
    console.log(theme.warning("Node appears to be already installed."));
    const proceed = await confirm({
      message: "Do you want to reinstall?",
      default: false,
    });
    if (!proceed) {
      console.log(theme.muted("Installation cancelled."));
      process.exit(0);
    }
  }

  console.log(theme.muted("This will install:"));
  console.log(theme.muted("  • k3s (Kubernetes)"));
  console.log(theme.muted("  • KubeVirt (VM orchestration)"));
  console.log(theme.muted("  • NVIDIA container toolkit (if GPU detected)"));
  console.log();

  const proceed = await confirm({
    message: "Do you want to continue?",
    default: true,
  });

  if (!proceed) {
    console.log(theme.muted("\nInstallation cancelled."));
    process.exit(0);
  }

  console.log();

  const authToken = loadToken();
  if (!authToken) {
    console.log(theme.error("✗ Not logged in"));
    console.log(theme.muted("  Run 'uva login' first"));
    process.exit(1);
  }

  const baseUrl = getBaseUrl();
  const tokenSpinner = ora("Creating registration token...").start();

  let registrationToken: string;
  try {
    const tokenResponse = await fetch(`${baseUrl}/api/nodes/tokens`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({}),
    });

    if (!tokenResponse.ok) {
      const errorBody = (await tokenResponse
        .json()
        .catch(() => ({ error: "Unknown error" }))) as { error?: string };
      throw new Error(errorBody.error || `HTTP ${tokenResponse.status}`);
    }

    const tokenData = (await tokenResponse.json()) as TokenCreateResponse;
    registrationToken = tokenData.token;
    tokenSpinner.succeed("Registration token created");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    tokenSpinner.fail(`Failed to create registration token: ${message}`);
    process.exit(1);
  }

  const spinner = ora("Downloading install script...").start();

  try {
    const scriptUrl = `${baseUrl}/install-node.sh`;

    const response = await fetch(scriptUrl);
    if (!response.ok) {
      throw new Error(`Failed to download script: ${response.status}`);
    }

    const script = await response.text();
    spinner.succeed("Downloaded install script");

    console.log(
      theme.muted(
        "\nRunning installation (this may take several minutes)...\n",
      ),
    );

    const tmpFile = `/tmp/install-node-${Date.now()}.sh`;
    writeFileSync(tmpFile, script, { mode: 0o755 });

    const scriptArgs = [tmpFile, "--token", registrationToken, "-y"];
    if (options.cpus) {
      scriptArgs.push("--cpus", options.cpus);
    }
    if (options.ram) {
      scriptArgs.push("--ram", options.ram);
    }
    if (options.storage) {
      scriptArgs.push("--storage", options.storage);
    }

    const result = await runCommand("bash", scriptArgs, { sudo: true });

    try {
      rmSync(tmpFile);
    } catch {}

    if (result.exitCode !== 0) {
      console.log(theme.error("\n✗ Installation failed"));
      process.exit(1);
    }

    console.log(theme.success("\n✓ Node installation complete!"));
    console.log();
    console.log(theme.muted("Next steps:"));
    console.log(
      theme.muted("  • Run 'uva node status' to check the node status"),
    );
    console.log(
      theme.muted(
        "  • If you have a GPU, run 'sudo gpu-mode-status' to check GPU mode",
      ),
    );
    console.log();
  } catch (error: any) {
    spinner.fail(`Installation failed: ${error.message}`);
    process.exit(1);
  }
}

async function callUnregisterApi(): Promise<{
  success: boolean;
  vmsDeleted: number;
  jobsCancelled: number;
  message: string;
}> {
  let nodeId: string | null = null;
  try {
    if (existsSync("/etc/uvacompute/node-config.yaml")) {
      const content = readFileSync("/etc/uvacompute/node-config.yaml", "utf8");
      const config = yaml.load(content) as Record<string, any>;
      nodeId = config?.nodeId || null;
    }
  } catch {}

  if (!nodeId) {
    nodeId = hostname();
  }

  const baseUrl = getBaseUrl();

  // Try HMAC auth first (node self-auth via node-secret or orchestration-secret)
  const nodeSecretFile = "/etc/uvacompute/node-secret";
  const legacySecretFile = "/etc/uvacompute/orchestration-secret";
  let secret = "";
  let useNodeAuth = false;

  try {
    if (existsSync(nodeSecretFile)) {
      secret = readFileSync(nodeSecretFile, "utf8").trim();
      useNodeAuth = true;
    } else if (existsSync(legacySecretFile)) {
      secret = readFileSync(legacySecretFile, "utf8").trim();
    }
  } catch {}

  if (secret) {
    const body = "";
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const payload = useNodeAuth
      ? `${nodeId}:${timestamp}:${body}`
      : `${timestamp}:${body}`;
    const signature = createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    const headers: Record<string, string> = {
      "X-Timestamp": timestamp,
      "X-Signature": signature,
    };
    if (useNodeAuth) {
      headers["X-Node-Id"] = nodeId;
    }

    try {
      const response = await fetch(`${baseUrl}/api/nodes/${nodeId}`, {
        method: "DELETE",
        headers,
      });
      if (response.ok) {
        const data = (await response.json()) as any;
        return {
          success: true,
          vmsDeleted: data.vmsDeleted ?? 0,
          jobsCancelled: data.jobsCancelled ?? 0,
          message: `Node unregistered (${data.vmsDeleted ?? 0} VMs stopped, ${data.jobsCancelled ?? 0} jobs cancelled)`,
        };
      }
      // If HMAC auth failed (401/403), fall through to bearer token
      if (response.status !== 401 && response.status !== 403) {
        return {
          success: false,
          vmsDeleted: 0,
          jobsCancelled: 0,
          message: `API returned status ${response.status}`,
        };
      }
    } catch (err: any) {
      return {
        success: false,
        vmsDeleted: 0,
        jobsCancelled: 0,
        message: `Could not reach hub API: ${err.message}`,
      };
    }
  }

  // Fall back to user bearer token auth (resolve real user's home under sudo)
  let token: string | null = null;
  try {
    const { join } = await import("path");
    const { homedir } = await import("os");
    const sudoUser = process.env.SUDO_USER;
    let home = homedir();
    if (sudoUser) {
      try {
        const { execSync } = await import("child_process");
        home =
          execSync(`getent passwd ${sudoUser}`, { encoding: "utf8" }).split(
            ":",
          )[5] || home;
      } catch {}
    }
    const configFile = join(home, ".uvacompute", "config");
    if (existsSync(configFile)) {
      const config = JSON.parse(readFileSync(configFile, "utf8"));
      token = config.auth_token || null;
    }
  } catch {}

  if (!token) {
    return {
      success: false,
      vmsDeleted: 0,
      jobsCancelled: 0,
      message:
        "No node secret or user token found, skipping API deregistration",
    };
  }

  try {
    const response = await fetch(`${baseUrl}/api/nodes/${nodeId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok) {
      const data = (await response.json()) as any;
      return {
        success: true,
        vmsDeleted: data.vmsDeleted ?? 0,
        jobsCancelled: data.jobsCancelled ?? 0,
        message: `Node unregistered via user auth (${data.vmsDeleted ?? 0} VMs stopped, ${data.jobsCancelled ?? 0} jobs cancelled)`,
      };
    } else if (response.status === 403) {
      return {
        success: false,
        vmsDeleted: 0,
        jobsCancelled: 0,
        message:
          "You do not own this node — deregister it from the web dashboard",
      };
    } else {
      return {
        success: false,
        vmsDeleted: 0,
        jobsCancelled: 0,
        message: `API returned status ${response.status}`,
      };
    }
  } catch (err: any) {
    return {
      success: false,
      vmsDeleted: 0,
      jobsCancelled: 0,
      message: `Could not reach hub API: ${err.message}`,
    };
  }
}

async function nodeUninstall(): Promise<void> {
  console.log(theme.emphasis("\nNode Uninstallation\n"));

  if (process.getuid?.() !== 0) {
    console.log(theme.error("✗ This command must be run as root"));
    console.log(theme.muted("  Run: sudo uva node uninstall"));
    process.exit(1);
  }

  // Resolve the real user's home dir — under sudo, homedir() returns /root
  // but the CLI state lives under the original user's home
  const { join } = await import("path");
  const { homedir } = await import("os");
  const sudoUser = process.env.SUDO_USER;
  let realHome = homedir();
  if (sudoUser) {
    try {
      const { execSync } = await import("child_process");
      realHome =
        execSync(`getent passwd ${sudoUser}`, { encoding: "utf8" }).split(
          ":",
        )[5] || realHome;
    } catch {}
  }
  const realNodeConfigDir = join(realHome, ".uvacompute", "node");
  const realStateFile = join(realNodeConfigDir, "install-state.yaml");

  // Load state from the real user's home, not /root
  let state: NodeState | null = null;
  try {
    if (existsSync(realStateFile)) {
      const content = readFileSync(realStateFile, "utf8");
      state = yaml.load(content) as NodeState;
    }
  } catch {}

  // Also check /etc/uvacompute as a fallback indicator
  const hasEtcConfig = existsSync("/etc/uvacompute");

  const isAgentMode =
    (state as any)?.install_mode === "agent" ||
    existsSync("/usr/local/bin/k3s-agent-uninstall.sh");

  if (!state?.installed && !hasEtcConfig) {
    console.log(theme.warning("Node does not appear to be installed."));
    const proceed = await confirm({
      message: "Do you want to attempt uninstallation anyway?",
      default: false,
    });
    if (!proceed) {
      console.log(theme.muted("Uninstallation cancelled."));
      process.exit(0);
    }
  }

  console.log(theme.warning("This will:"));
  console.log(
    theme.warning("  • Deregister node from hub (stop VMs, cancel jobs)"),
  );
  if (isAgentMode) {
    console.log(theme.warning("  • Remove k3s agent"));
    console.log(theme.warning("  • Remove SSH tunnel service"));
  } else {
    console.log(
      theme.warning("  • Remove k3s server and all Kubernetes resources"),
    );
    console.log(theme.warning("  • Remove KubeVirt"));
  }
  console.log(theme.warning("  • Clean up all container images"));
  console.log(theme.warning("  • Delete VM storage (/var/lib/uvacompute)"));
  console.log(
    theme.warning("  • Remove GPU scripts, guardian, and reconcile service"),
  );
  console.log(theme.warning("  • Remove SSH keys and vmproxy access"));
  console.log(theme.warning("  • Remove kubeconfig, virtctl, and CDI config"));
  console.log(
    theme.warning("  • Remove all uvacompute configuration and secrets"),
  );
  console.log();

  const proceed = await confirm({
    message: "Are you sure you want to uninstall?",
    default: false,
  });

  if (!proceed) {
    console.log(theme.muted("\nUninstallation cancelled."));
    process.exit(0);
  }

  console.log();
  const spinner = ora("Uninstalling node components...").start();

  try {
    // Step 1: API deregistration (must happen first — needs secrets from /etc/uvacompute/)
    spinner.text = "Deregistering node from hub...";
    const apiResult = await callUnregisterApi();
    if (apiResult.success) {
      console.log(`\n  ${theme.success("✓")} ${apiResult.message}`);
    } else {
      console.log(`\n  ${theme.warning("⚠")} ${apiResult.message}`);
    }

    // Step 2: KubeVirt removal (standalone server mode only, needs k3s running)
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
      ).catch(() => {});
      await runCommand(
        "kubectl",
        [
          "delete",
          "-f",
          "https://github.com/kubevirt/kubevirt/releases/download/v1.3.0/kubevirt-operator.yaml",
          "--ignore-not-found",
        ],
        { sudo: true },
      ).catch(() => {});
    }

    // Step 3: Stop all uvacompute services
    spinner.text = "Stopping uvacompute services...";
    for (const service of [
      "uvacompute-tunnel",
      "uvacompute-gpu-reconcile",
      "uvacompute-gpu-guardian",
    ]) {
      await runCommand("systemctl", ["stop", service], { sudo: true }).catch(
        () => {},
      );
      await runCommand("systemctl", ["disable", service], { sudo: true }).catch(
        () => {},
      );
    }

    // Step 4: Container image cleanup (needs containerd from k3s still running)
    spinner.text = "Cleaning up container images...";
    try {
      const imagesResult = await runCommand("crictl", ["images", "-q"], {
        sudo: true,
        silent: true,
      });
      if (imagesResult.exitCode === 0 && imagesResult.stdout.trim()) {
        const imageIds = imagesResult.stdout.trim().split("\n").filter(Boolean);
        for (const imageId of imageIds) {
          await runCommand("crictl", ["rmi", imageId], {
            sudo: true,
            silent: true,
          }).catch(() => {});
        }
      }
    } catch {}

    // Step 5: Remove k3s (agent or server)
    spinner.text = "Removing k3s...";
    if (existsSync("/usr/local/bin/k3s-agent-uninstall.sh")) {
      await runCommand("/usr/local/bin/k3s-agent-uninstall.sh", [], {
        sudo: true,
      }).catch(() => {});
    } else if (existsSync("/usr/local/bin/k3s-uninstall.sh")) {
      await runCommand("/usr/local/bin/k3s-uninstall.sh", [], {
        sudo: true,
      }).catch(() => {});
    }

    // Step 6: Remove uvacompute storage
    spinner.text = "Removing storage directories...";
    if (existsSync("/var/lib/uvacompute")) {
      await runCommand("rm", ["-rf", "/var/lib/uvacompute"], {
        sudo: true,
      }).catch(() => {});
    }

    // Step 7: Remove GPU components (guardian, mode scripts, service files)
    spinner.text = "Removing GPU components...";
    const gpuFiles = [
      "/usr/local/bin/gpu-guardian",
      "/usr/local/bin/gpu-mode-nvidia",
      "/usr/local/bin/gpu-mode-vfio",
      "/usr/local/bin/gpu-mode-status",
      "/usr/local/bin/gpu-mode-reconcile",
      "/etc/systemd/system/uvacompute-gpu-guardian.service",
      "/etc/systemd/system/uvacompute-gpu-reconcile.service",
    ];
    for (const f of gpuFiles) {
      if (existsSync(f)) {
        await runCommand("rm", ["-f", f], { sudo: true }).catch(() => {});
      }
    }

    // Step 8: Remove virtctl
    if (existsSync("/usr/local/bin/virtctl")) {
      await runCommand("rm", ["-f", "/usr/local/bin/virtctl"], {
        sudo: true,
      }).catch(() => {});
    }

    // Step 9: Remove runc symlink (created by install script)
    if (existsSync("/usr/local/bin/runc")) {
      await runCommand("rm", ["-f", "/usr/local/bin/runc"], {
        sudo: true,
      }).catch(() => {});
    }

    // Step 10: Remove CDI config
    if (existsSync("/etc/cdi/nvidia.yaml")) {
      await runCommand("rm", ["-f", "/etc/cdi/nvidia.yaml"], {
        sudo: true,
      }).catch(() => {});
    }

    // Step 11: Remove tunnel service file and reload systemd
    spinner.text = "Removing service files...";
    if (existsSync("/etc/systemd/system/uvacompute-tunnel.service")) {
      await runCommand(
        "rm",
        ["-f", "/etc/systemd/system/uvacompute-tunnel.service"],
        { sudo: true },
      ).catch(() => {});
    }
    await runCommand("systemctl", ["daemon-reload"], { sudo: true }).catch(
      () => {},
    );

    // Step 12: Remove SSH keys and vmproxy authorized_keys entry
    spinner.text = "Removing SSH keys...";
    for (const keyFile of [
      "/root/.ssh/id_ed25519_uvacompute",
      "/root/.ssh/id_ed25519_uvacompute.pub",
    ]) {
      if (existsSync(keyFile)) {
        await runCommand("rm", ["-f", keyFile], { sudo: true }).catch(() => {});
      }
    }
    if (existsSync("/root/.ssh/authorized_keys")) {
      await runCommand(
        "sed",
        ["-i", "/vmproxy@/d", "/root/.ssh/authorized_keys"],
        { sudo: true },
      ).catch(() => {});
    }

    // Step 13: Remove kubeconfig (written by install script, points at hub)
    spinner.text = "Removing kubeconfig...";
    if (existsSync("/root/.kube/config")) {
      await runCommand("rm", ["-f", "/root/.kube/config"], {
        sudo: true,
      }).catch(() => {});
    }

    // Step 14: Remove config directories (last — step 1 reads from /etc/uvacompute/)
    spinner.text = "Removing configuration...";
    if (existsSync("/etc/uvacompute")) {
      await runCommand("rm", ["-rf", "/etc/uvacompute"], { sudo: true }).catch(
        () => {},
      );
    }
    if (existsSync(realNodeConfigDir)) {
      rmSync(realNodeConfigDir, { recursive: true, force: true });
    }
    // Also clean up /root/.uvacompute/node/ in case anything was written there
    if (existsSync(NODE_CONFIG_DIR) && NODE_CONFIG_DIR !== realNodeConfigDir) {
      rmSync(NODE_CONFIG_DIR, { recursive: true, force: true });
    }

    spinner.succeed("Node uninstalled successfully");
    console.log();
    console.log(
      theme.muted("Note: nvidia-container-toolkit package was not removed."),
    );
    console.log(
      theme.muted(
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

async function nodeGpuModeStatus(): Promise<void> {
  if (!existsSync("/usr/local/bin/gpu-mode-status")) {
    console.log(theme.error("✗ GPU mode scripts not found"));
    console.log(
      theme.muted("  Install a node with GPU first: uva node install"),
    );
    process.exit(1);
  }

  const result = await runCommand("gpu-mode-status", [], { sudo: true });
  process.exit(result.exitCode);
}

function nodeGpuModeSwitch(mode: "nvidia" | "vfio"): () => Promise<void> {
  return async () => {
    const scriptName = `gpu-mode-${mode}`;
    if (!existsSync(`/usr/local/bin/${scriptName}`)) {
      console.log(theme.error("✗ GPU mode scripts not found"));
      console.log(
        theme.muted("  Install a node with GPU first: uva node install"),
      );
      process.exit(1);
    }

    const label =
      mode === "nvidia"
        ? "nvidia (container mode)"
        : "vfio-pci (VM passthrough mode)";

    const proceed = await confirm({
      message: `Switch GPU to ${label}?`,
      default: true,
    });

    if (!proceed) {
      console.log(theme.muted("\nCancelled."));
      return;
    }

    console.log();
    const result = await runCommand(scriptName, [], { sudo: true });

    if (result.exitCode !== 0) {
      console.log(theme.error(`\n✗ Failed to switch to ${mode} mode`));
      process.exit(1);
    }
  };
}

async function nodePause(): Promise<void> {
  console.log(theme.emphasis("\nPausing Node\n"));

  const state = loadNodeState();
  if (!state?.installed) {
    console.log(theme.error("✗ Node is not installed"));
    console.log(theme.muted("  Run 'uva node install' first"));
    process.exit(1);
  }

  const nodeName = await getK3sNodeName();
  if (!nodeName) {
    console.log(theme.error("✗ Could not get node name"));
    console.log(theme.muted("  Is k3s running? Try 'uva node status'"));
    process.exit(1);
  }

  const alreadyPaused = await isNodePaused();
  if (alreadyPaused) {
    console.log(theme.warning("Node is already paused"));
    console.log(
      theme.muted("  Run 'uva node resume' to accept workloads again"),
    );
    return;
  }

  const spinner = ora(`Cordoning node ${nodeName}...`).start();

  const result = await runKubectl(["cordon", nodeName]);

  if (result.exitCode !== 0) {
    spinner.fail("Failed to pause node");
    console.log(theme.error(result.stderr));
    process.exit(1);
  }

  spinner.succeed(theme.success(`Node ${nodeName} is now paused`));
  console.log();
  console.log(theme.muted("The node will no longer accept new workloads."));
  console.log(theme.muted("Existing workloads will continue running."));
  console.log(theme.muted("Run 'uva node resume' to accept workloads again."));
  console.log();
}

async function nodeResume(): Promise<void> {
  console.log(theme.emphasis("\nResuming Node\n"));

  const state = loadNodeState();
  if (!state?.installed) {
    console.log(theme.error("✗ Node is not installed"));
    console.log(theme.muted("  Run 'uva node install' first"));
    process.exit(1);
  }

  const nodeName = await getK3sNodeName();
  if (!nodeName) {
    console.log(theme.error("✗ Could not get node name"));
    console.log(theme.muted("  Is k3s running? Try 'uva node status'"));
    process.exit(1);
  }

  const isPaused = await isNodePaused();
  if (!isPaused) {
    console.log(theme.warning("Node is not paused"));
    console.log(theme.muted("  The node is already accepting workloads"));
    return;
  }

  const spinner = ora(`Uncordoning node ${nodeName}...`).start();

  const result = await runKubectl(["uncordon", nodeName]);

  if (result.exitCode !== 0) {
    spinner.fail("Failed to resume node");
    console.log(theme.error(result.stderr));
    process.exit(1);
  }

  spinner.succeed(theme.success(`Node ${nodeName} is now accepting workloads`));
  console.log();
}

async function nodeStatus(): Promise<void> {
  console.log(theme.emphasis("\nNode Status\n"));

  const config = loadNodeConfig();
  const state = loadNodeState();
  const prepareState = loadPrepareState();

  console.log(theme.info("Preparation State:"));
  if (prepareState?.prepared) {
    console.log(theme.success("  ✓ System is prepared"));
    if (prepareState.prepare_date) {
      console.log(theme.muted(`    Prepared: ${prepareState.prepare_date}`));
    }
    if (prepareState.os_id) {
      console.log(
        theme.muted(
          `    OS: ${prepareState.os_id}${prepareState.os_version ? ` ${prepareState.os_version}` : ""}`,
        ),
      );
    }
    if (prepareState.gpu_detected) {
      console.log(
        theme.muted(
          `    GPU: Detected${prepareState.driver_installed ? `, driver ${prepareState.driver_version || "installed"}` : ", driver not installed"}`,
        ),
      );
    }
    if (prepareState.iommu_enabled !== undefined) {
      console.log(
        theme.muted(
          `    IOMMU: ${prepareState.iommu_enabled ? "Enabled" : "Not enabled"}${prepareState.iommu_gpu_isolated ? ", GPU isolated" : ""}`,
        ),
      );
    }
    if (prepareState.reboot_required) {
      console.log(theme.warning("    ⚠ Reboot required before installation"));
    }
  } else {
    console.log(theme.muted("  ○ Not prepared"));
    console.log(
      theme.muted("    Run 'uva node prepare' to prepare the system"),
    );
  }

  console.log();
  console.log(theme.info("Installation State:"));
  if (state?.installed) {
    console.log(theme.success("  ✓ Node is installed"));
    if (config?.install_date) {
      console.log(theme.muted(`    Installed: ${config.install_date}`));
    }
  } else {
    console.log(theme.warning("  ✗ Node is not installed"));
    if (prepareState?.prepared && !prepareState.reboot_required) {
      console.log(theme.muted("    Run 'uva node install' to install"));
    } else if (prepareState?.reboot_required) {
      console.log(theme.muted("    Reboot first, then run 'uva node install'"));
    } else {
      console.log(theme.muted("    Run 'uva node prepare' first"));
    }
    console.log();
    return;
  }

  console.log();
  console.log(theme.info("k3s (Kubernetes):"));
  const spinner = ora({ text: "Checking k3s...", indent: 2 }).start();

  const k3s = await checkK3sStatus();
  if (k3s.running) {
    spinner.succeed(
      theme.success(`Running${k3s.version ? ` (${k3s.version})` : ""}`),
    );
  } else {
    spinner.fail(theme.error("Not running"));
  }

  console.log();
  console.log(theme.info("KubeVirt:"));
  const kvSpinner = ora({ text: "Checking KubeVirt...", indent: 2 }).start();

  const kubevirt = await checkKubeVirtStatus();
  if (kubevirt.installed) {
    if (kubevirt.phase === "Deployed") {
      kvSpinner.succeed(theme.success(`Deployed`));
    } else {
      kvSpinner.warn(theme.warning(`Phase: ${kubevirt.phase}`));
    }
  } else {
    kvSpinner.fail(theme.error("Not installed"));
  }

  console.log();
  console.log(theme.info("GPU:"));
  const gpuSpinner = ora({ text: "Checking GPU...", indent: 2 }).start();

  const gpu = await checkGpuStatus();
  if (gpu.detected) {
    gpuSpinner.succeed(theme.success("NVIDIA GPU detected"));
    console.log(theme.muted(`    Driver in use: ${gpu.driver}`));
    if (gpu.available) {
      console.log(theme.success("    ✓ Available to Kubernetes"));
    } else {
      console.log(theme.warning("    ✗ Not available to Kubernetes"));
    }
    console.log();
    console.log(theme.muted("  GPU mode commands:"));
    console.log(
      theme.muted("    uva node gpu-mode status  - Show current mode"),
    );
    console.log(
      theme.muted("    uva node gpu-mode nvidia  - Switch to container mode"),
    );
    console.log(
      theme.muted(
        "    uva node gpu-mode vfio    - Switch to VM passthrough mode",
      ),
    );
  } else {
    gpuSpinner.info(theme.muted("No NVIDIA GPU detected"));
  }

  console.log();
  console.log(theme.info("Node Scheduling:"));
  const schedSpinner = ora({
    text: "Checking scheduling status...",
    indent: 2,
  }).start();

  const paused = await isNodePaused();
  if (paused) {
    schedSpinner.warn(theme.warning("Paused (not accepting new workloads)"));
    console.log(theme.muted("    Run 'uva node resume' to accept workloads"));
  } else {
    schedSpinner.succeed(theme.success("Active (accepting workloads)"));
  }

  console.log();
  console.log(theme.info("Workloads:"));
  const workloadSpinner = ora({
    text: "Checking workloads...",
    indent: 2,
  }).start();

  const workloads = await getWorkloads();
  workloadSpinner.stop();

  if (workloads.vms.length === 0 && workloads.jobs.length === 0) {
    console.log(theme.muted("  No active workloads"));
  } else {
    if (workloads.vms.length > 0) {
      console.log(theme.muted(`  VMs: ${workloads.vms.length}`));
      for (const vm of workloads.vms) {
        console.log(theme.muted(`    • ${vm.name} (${vm.status})`));
      }
    }
    if (workloads.jobs.length > 0) {
      console.log(theme.muted(`  Jobs: ${workloads.jobs.length}`));
      for (const job of workloads.jobs) {
        console.log(theme.muted(`    • ${job.name} (${job.status})`));
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
  console.log(theme.emphasis("\nCreate Node Registration Token\n"));

  const token = loadToken();
  if (!token) {
    console.log(theme.error("✗ Not logged in"));
    console.log(theme.muted("  Run 'uva login' first"));
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
    console.log(theme.info("Token Details:"));
    console.log(theme.muted(`  Token: ${theme.accent(data.token)}`));
    console.log(theme.muted(`  Assigned Port: ${data.assignedPort}`));
    console.log(
      theme.muted(`  Expires: ${new Date(data.expiresAt).toLocaleString()}`),
    );
    console.log();
    console.log(theme.info("Installation Command:"));
    console.log(
      theme.accent(
        `  curl -fsSL ${baseUrl}/install-node.sh | sudo bash -s -- --token ${data.token}`,
      ),
    );
    console.log();
    console.log(
      theme.warning(
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
  console.log(theme.emphasis("\nNode Registration Tokens\n"));

  const token = loadToken();
  if (!token) {
    console.log(theme.error("✗ Not logged in"));
    console.log(theme.muted("  Run 'uva login' first"));
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
      console.log(theme.muted("  No tokens found"));
      console.log(theme.muted("  Create one with 'uva node token create'"));
    } else {
      for (const token of tokens) {
        const statusColor = token.used
          ? theme.muted
          : token.expired
            ? theme.warning
            : theme.success;
        const status = token.used
          ? "[USED]"
          : token.expired
            ? "[EXPIRED]"
            : "[ACTIVE]";

        console.log(statusColor(`  ${status} Port ${token.assignedPort}`));
        console.log(
          theme.muted(`    Token: ${token.token.substring(0, 8)}...`),
        );
        console.log(
          theme.muted(
            `    Created: ${new Date(token.createdAt).toLocaleString()}`,
          ),
        );
        if (token.usedByNodeId) {
          console.log(theme.muted(`    Used by: ${token.usedByNodeId}`));
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

async function nodeListRemote(): Promise<void> {
  console.log(theme.emphasis("\nMy Contributed Nodes\n"));

  const token = loadToken();
  if (!token) {
    console.log(theme.error("✗ Not logged in. Run 'uva login' first."));
    process.exit(1);
  }

  const spinner = ora("Fetching your nodes...").start();

  try {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/contributor/nodes`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const errorBody = (await response
        .json()
        .catch(() => ({ error: "Unknown error" }))) as { error?: string };
      throw new Error(errorBody.error || `HTTP ${response.status}`);
    }

    const data = (await response.json()) as { nodes: RemoteNode[] };
    const nodes = data.nodes || [];

    spinner.succeed(`Found ${nodes.length} node(s)`);
    console.log();

    if (nodes.length === 0) {
      console.log(theme.muted("  You haven't contributed any nodes yet."));
      console.log(
        theme.muted("  Contact an admin to get an installation token."),
      );
    } else {
      for (const node of nodes) {
        const statusColor =
          node.status === "online"
            ? theme.success
            : node.status === "draining"
              ? theme.warning
              : theme.error;
        const statusIcon =
          node.status === "online"
            ? "●"
            : node.status === "draining"
              ? "◐"
              : "○";

        console.log(
          `  ${statusColor(statusIcon)} ${theme.emphasis(node.name || node.nodeId)}`,
        );
        console.log(theme.muted(`    ID: ${node.nodeId}`));
        console.log(
          theme.muted(
            `    Resources: ${node.cpus || 0} CPUs, ${node.ram || 0}GB RAM, ${node.gpus || 0} GPUs`,
          ),
        );
        console.log(theme.muted(`    Status: ${statusColor(node.status)}`));
        console.log(
          theme.muted(
            `    Last heartbeat: ${new Date(node.lastHeartbeat).toLocaleString()}`,
          ),
        );
        console.log();
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    spinner.fail(`Failed to fetch nodes: ${message}`);
    process.exit(1);
  }
}

async function nodeStatusRemote(nodeId: string): Promise<void> {
  console.log(theme.emphasis(`\nNode Status: ${nodeId}\n`));

  const token = loadToken();
  if (!token) {
    console.log(theme.error("✗ Not logged in. Run 'uva login' first."));
    process.exit(1);
  }

  const spinner = ora("Fetching node status...").start();

  try {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/contributor/nodes/${nodeId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const errorBody = (await response
        .json()
        .catch(() => ({ error: "Unknown error" }))) as { error?: string };
      throw new Error(errorBody.error || `HTTP ${response.status}`);
    }

    const data = (await response.json()) as { node: RemoteNode };
    const node = data.node;

    spinner.succeed("Node found");
    console.log();

    const statusColor =
      node.status === "online"
        ? theme.success
        : node.status === "draining"
          ? theme.warning
          : theme.error;

    console.log(`  ${theme.emphasis("Name:")} ${node.name || "(unnamed)"}`);
    console.log(`  ${theme.emphasis("Node ID:")} ${node.nodeId}`);
    console.log(`  ${theme.emphasis("Status:")} ${statusColor(node.status)}`);
    console.log(`  ${theme.emphasis("CPUs:")} ${node.cpus || 0}`);
    console.log(`  ${theme.emphasis("RAM:")} ${node.ram || 0}GB`);
    console.log(`  ${theme.emphasis("GPUs:")} ${node.gpus || 0}`);
    console.log(
      `  ${theme.emphasis("Registered:")} ${new Date(node.registeredAt).toLocaleString()}`,
    );
    console.log(
      `  ${theme.emphasis("Last heartbeat:")} ${new Date(node.lastHeartbeat).toLocaleString()}`,
    );
    console.log();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    spinner.fail(`Failed to fetch node: ${message}`);
    process.exit(1);
  }
}

async function nodePauseRemote(nodeId: string): Promise<void> {
  console.log(theme.emphasis(`\nPausing Node: ${nodeId}\n`));

  const token = loadToken();
  if (!token) {
    console.log(theme.error("✗ Not logged in. Run 'uva login' first."));
    process.exit(1);
  }

  const spinner = ora("Pausing node...").start();

  try {
    const baseUrl = getBaseUrl();
    const response = await fetch(
      `${baseUrl}/api/contributor/nodes/${nodeId}/pause`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!response.ok) {
      const errorBody = (await response
        .json()
        .catch(() => ({ error: "Unknown error" }))) as { error?: string };
      throw new Error(errorBody.error || `HTTP ${response.status}`);
    }

    spinner.succeed("Node paused successfully");
    console.log(theme.muted("\n  The node will stop accepting new workloads."));
    console.log(theme.muted("  Existing workloads will continue to run."));
    console.log();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    spinner.fail(`Failed to pause node: ${message}`);
    process.exit(1);
  }
}

async function nodeResumeRemote(nodeId: string): Promise<void> {
  console.log(theme.emphasis(`\nResuming Node: ${nodeId}\n`));

  const token = loadToken();
  if (!token) {
    console.log(theme.error("✗ Not logged in. Run 'uva login' first."));
    process.exit(1);
  }

  const spinner = ora("Resuming node...").start();

  try {
    const baseUrl = getBaseUrl();
    const response = await fetch(
      `${baseUrl}/api/contributor/nodes/${nodeId}/resume`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!response.ok) {
      const errorBody = (await response
        .json()
        .catch(() => ({ error: "Unknown error" }))) as { error?: string };
      throw new Error(errorBody.error || `HTTP ${response.status}`);
    }

    spinner.succeed("Node resumed successfully");
    console.log(theme.muted("\n  The node is now accepting new workloads."));
    console.log();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    spinner.fail(`Failed to resume node: ${message}`);
    process.exit(1);
  }
}

async function nodeWorkloadsRemote(nodeId: string): Promise<void> {
  console.log(theme.emphasis(`\nWorkloads on Node: ${nodeId}\n`));

  const token = loadToken();
  if (!token) {
    console.log(theme.error("✗ Not logged in. Run 'uva login' first."));
    process.exit(1);
  }

  const spinner = ora("Fetching workloads...").start();

  try {
    const baseUrl = getBaseUrl();
    const response = await fetch(
      `${baseUrl}/api/contributor/nodes/${nodeId}/workloads`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!response.ok) {
      const errorBody = (await response
        .json()
        .catch(() => ({ error: "Unknown error" }))) as { error?: string };
      throw new Error(errorBody.error || `HTTP ${response.status}`);
    }

    const data = (await response.json()) as {
      vms: RemoteVM[];
      jobs: RemoteJob[];
    };
    const { vms, jobs } = data;

    const total = vms.length + jobs.length;
    spinner.succeed(`Found ${total} active workload(s)`);
    console.log();

    if (total === 0) {
      console.log(theme.muted("  No active workloads on this node."));
    } else {
      if (vms.length > 0) {
        console.log(theme.emphasis("  VMs:"));
        for (const vm of vms) {
          console.log(theme.info(`    • ${vm.name || vm.vmId.slice(0, 8)}`));
          console.log(
            theme.muted(
              `      ${vm.cpus} CPUs, ${vm.ram}GB RAM, ${vm.gpus} GPUs - ${vm.status}`,
            ),
          );
        }
        console.log();
      }

      if (jobs.length > 0) {
        console.log(theme.emphasis("  Jobs:"));
        for (const job of jobs) {
          console.log(
            theme.accent(`    • ${job.name || job.jobId.slice(0, 8)}`),
          );
          console.log(
            theme.muted(
              `      ${job.cpus} CPUs, ${job.ram}GB RAM, ${job.gpus} GPUs - ${job.status}`,
            ),
          );
        }
        console.log();
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    spinner.fail(`Failed to fetch workloads: ${message}`);
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
    .option(
      "--cpus <count>",
      "Number of CPUs to contribute (default: total - 4)",
    )
    .option("--ram <gb>", "RAM in GB to contribute (default: total - 4)")
    .option("--storage <gb>", "Storage allocation in GB for VM disks")
    .action((options) => nodeInstall(options));

  node
    .command("uninstall")
    .description("Remove all node components installed by uva node install")
    .action(nodeUninstall);

  node
    .command("list")
    .alias("ls")
    .description("List your contributed nodes (remote)")
    .action(nodeListRemote);

  node
    .command("status [nodeId]")
    .description(
      "Show node status (local if no nodeId, remote if nodeId provided)",
    )
    .action((nodeId?: string) => {
      if (nodeId) {
        nodeStatusRemote(nodeId);
      } else {
        nodeStatus();
      }
    });

  node
    .command("pause [nodeId]")
    .description(
      "Pause node - stop accepting workloads (local if no nodeId, remote if nodeId provided)",
    )
    .action((nodeId?: string) => {
      if (nodeId) {
        nodePauseRemote(nodeId);
      } else {
        nodePause();
      }
    });

  node
    .command("resume [nodeId]")
    .description(
      "Resume node - start accepting workloads (local if no nodeId, remote if nodeId provided)",
    )
    .action((nodeId?: string) => {
      if (nodeId) {
        nodeResumeRemote(nodeId);
      } else {
        nodeResume();
      }
    });

  node
    .command("workloads <nodeId>")
    .description("Show active workloads on a remote node")
    .action(nodeWorkloadsRemote);

  // GPU mode subcommands (local only)
  const gpuMode = node
    .command("gpu-mode")
    .description("Manage GPU driver mode (must run on node)");

  gpuMode
    .command("status")
    .description("Show current GPU driver mode")
    .action(nodeGpuModeStatus);

  gpuMode
    .command("nvidia")
    .description("Switch to nvidia driver (container mode)")
    .action(nodeGpuModeSwitch("nvidia"));

  gpuMode
    .command("vfio")
    .description("Switch to vfio-pci driver (VM passthrough mode)")
    .action(nodeGpuModeSwitch("vfio"));

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
    .alias("ls")
    .description("List all registration tokens")
    .action(nodeTokenList);
}
