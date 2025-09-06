import type { Command } from "commander";
import { getBaseUrl, getStoredToken } from "./lib/utils";

const BASE_URL = getBaseUrl();

async function incrementCounter(): Promise<void> {
  try {
    const response = await fetch(`${BASE_URL}/api/counter/increment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getStoredToken()}`,
      },
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`HTTP ${response.status}: ${body}`);
    }
    console.log("✅ Counter incremented.");
  } catch (err: any) {
    console.error("❌ Failed to increment counter:", err?.message || err);
    process.exit(1);
  }
}

export function registerIncrementCommand(program: Command) {
  program
    .command("increment")
    .description("Increment counter")
    .action(incrementCounter);
}
