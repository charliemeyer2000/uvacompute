import { homedir, userInfo } from "os";
import { join } from "path";
import { execSync } from "child_process";

export const DEV_SITE_URL = "http://localhost:3000" as const;
export const PROD_SITE_URL = "https://uvacompute.com" as const;
export const STATUS_URL = "https://status.uvacompute.com" as const;

function resolveHomeDir(): string {
  const sudoUser = process.env.SUDO_USER;
  if (sudoUser && process.getuid?.() === 0) {
    try {
      return execSync(`eval echo ~${sudoUser}`, { encoding: "utf-8" }).trim();
    } catch {}
  }
  return homedir();
}

export const CONFIG_DIR = join(resolveHomeDir(), ".uvacompute");
export const CONFIG_FILE = join(CONFIG_DIR, "config");

export const NODE_CONFIG_DIR = join(CONFIG_DIR, "node");
export const NODE_CONFIG_FILE = join(NODE_CONFIG_DIR, "config.yaml");
export const NODE_STATE_FILE = join(NODE_CONFIG_DIR, "install-state.yaml");
export const PREPARE_STATE_FILE = join(NODE_CONFIG_DIR, "prepare-state.yaml");
export const INSTALL_SCRIPT_URL = `${PROD_SITE_URL}/install-node.sh`;

export const CLIENT_ID = "uvacompute-cli" as const;

export const DEFAULT_DEVICE_POLL_INTERVAL_SECONDS = 5 as const;
export const DEFAULT_DEVICE_EXPIRES_SECONDS = 1800 as const; // 30 minutes
