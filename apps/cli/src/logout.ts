import type { Command } from "commander";
import { existsSync, writeFileSync, readFileSync } from "fs";
import { CONFIG_FILE } from "./lib/constants";
import { theme } from "./lib/theme";
import { loadToken } from "./lib/utils";

async function logout(): Promise<void> {
  try {
    const token = loadToken();

    if (!token) {
      console.log(theme.warning("Not logged in"));
      process.exit(0);
    }

    if (!existsSync(CONFIG_FILE)) {
      console.log(theme.warning("Not logged in"));
      process.exit(0);
    }

    const config = JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
    delete config.auth_token;
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

    console.log(theme.success("Logged out successfully"));
  } catch (error: any) {
    console.error(theme.error(`Error during logout: ${error.message}`));
    process.exit(1);
  }
}

export function registerLogoutCommand(program: Command) {
  program
    .command("logout")
    .description("Logout from uvacompute")
    .action(logout);
}
