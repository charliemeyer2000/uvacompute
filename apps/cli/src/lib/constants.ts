import { homedir } from "os";
import { join } from "path";

export const DEV_SITE_URL = "http://localhost:3000" as const;
export const PROD_SITE_URL = "https://uvacompute.com" as const;

export const CONFIG_DIR = join(homedir(), ".uvacompute");
export const CONFIG_FILE = join(CONFIG_DIR, "config");

export const CLIENT_ID = "uvacompute-cli" as const;

export const DEFAULT_DEVICE_POLL_INTERVAL_SECONDS = 5 as const;
export const DEFAULT_DEVICE_EXPIRES_SECONDS = 1800 as const; // 30 minutes
