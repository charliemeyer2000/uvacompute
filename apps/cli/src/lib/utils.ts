import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import {
  CONFIG_DIR,
  CONFIG_FILE,
  DEV_SITE_URL,
  PROD_SITE_URL,
  STATUS_URL,
} from "./constants";
import { StatusApiResponseSchema } from "./schemas";
import type { z } from "zod";

export type ServiceStatus = z.infer<typeof StatusApiResponseSchema>;

let _nonInteractive = false;

export function setNonInteractive(value: boolean): void {
  _nonInteractive = value;
}

export function isNonInteractive(): boolean {
  return _nonInteractive;
}

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

export function hasShownCompletionPrompt(): boolean {
  try {
    const config = loadConfig();
    return config.completion_prompt_shown === true;
  } catch {
    return false;
  }
}

export function markCompletionPromptShown(): void {
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }

    const existingConfig = loadConfig();
    const config = { ...existingConfig, completion_prompt_shown: true };
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch {
    // no-op: best-effort write
  }
}

export function formatElapsed(startTime: number): string {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  if (elapsed < 60) return `${elapsed}s`;
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  return `${minutes}m${seconds.toString().padStart(2, "0")}s`;
}

export async function checkServiceStatus(): Promise<ServiceStatus | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(`${STATUS_URL}/api/status`, {
      signal: controller.signal,
    });

    if (!response.ok) {
      clearTimeout(timeoutId);
      return null;
    }

    const data = await response.json();
    const parsed = StatusApiResponseSchema.parse(data);
    clearTimeout(timeoutId);
    return parsed;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}
