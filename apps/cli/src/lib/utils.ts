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

    const config = { auth_token: accessToken } as const;
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch {
    // no-op: best-effort write
  }
}

export function loadToken(): string | null {
  try {
    if (!existsSync(CONFIG_FILE)) {
      return null;
    }
    const data = JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
    return data.auth_token || null;
  } catch {
    return null;
  }
}

export function getStoredToken(): string | null {
  return loadToken();
}
