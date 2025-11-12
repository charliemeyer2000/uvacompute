import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import {
  CONFIG_DIR,
  CONFIG_FILE,
  DEV_SITE_URL,
  PROD_SITE_URL,
} from "./constants";

export function getBaseUrl(): string {
  if (process.env.SITE_URL) {
    return process.env.SITE_URL;
  }

  if (process.env.NODE_ENV === "production") {
    return PROD_SITE_URL;
  }

  return DEV_SITE_URL;
}

export function saveToken(accessToken: string): void {
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }

    const existingConfig = loadConfig();
    const config = { ...existingConfig, auth_token: accessToken };
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch {
    // no-op: best-effort write
  }
}

function loadConfig(): Record<string, any> {
  try {
    if (!existsSync(CONFIG_FILE)) {
      return {};
    }
    return JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    return {};
  }
}

export function loadToken(): string | null {
  try {
    const config = loadConfig();
    return config.auth_token || null;
  } catch {
    return null;
  }
}

export function getStoredToken(): string | null {
  return loadToken();
}

export function saveVersionInfo(version: string, timestamp: number): void {
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }

    const existingConfig = loadConfig();
    const config = {
      ...existingConfig,
      installed_version: version,
      last_version_check: timestamp,
    };
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch {
    // no-op: best-effort write
  }
}

export function loadVersionInfo(): {
  version: string | null;
  lastCheck: number | null;
} {
  try {
    const config = loadConfig();
    return {
      version: config.installed_version || null,
      lastCheck: config.last_version_check || null,
    };
  } catch {
    return { version: null, lastCheck: null };
  }
}

export async function validateToken(
  token: string,
  baseUrl: string,
): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/api/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function compareVersions(current: string, latest: string): boolean {
  const parseCurrent = current.split(".").map(Number);
  const parseLatest = latest.split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    const currentPart = parseCurrent[i] || 0;
    const latestPart = parseLatest[i] || 0;

    if (latestPart > currentPart) {
      return true;
    }
    if (latestPart < currentPart) {
      return false;
    }
  }

  return false;
}

export async function findBinaryPath(): Promise<string | null> {
  try {
    const proc = Bun.spawn(["which", "uva"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const text = await new Response(proc.stdout).text();
    await proc.exited;

    if (proc.exitCode === 0 && text.trim()) {
      return text.trim();
    }
  } catch {}

  const commonPaths = [
    "/usr/local/bin/uva",
    "/usr/bin/uva",
    `${process.env.HOME}/.local/bin/uva`,
    `${process.env.HOME}/bin/uva`,
  ];

  for (const path of commonPaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  return null;
}
