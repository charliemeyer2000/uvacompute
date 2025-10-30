import boxen from "boxen";
import chalk from "chalk";
import { getBaseUrl, loadVersionInfo, saveVersionInfo } from "./utils";

const CURRENT_VERSION = require("../../package.json").version;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

function compareVersions(current: string, latest: string): boolean {
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

export async function checkForUpdate(): Promise<void> {
  try {
    const versionInfo = loadVersionInfo();
    const now = Date.now();

    if (
      versionInfo.lastCheck &&
      now - versionInfo.lastCheck < CHECK_INTERVAL_MS
    ) {
      return;
    }

    if (!versionInfo.version) {
      saveVersionInfo(CURRENT_VERSION, now);
      return;
    }

    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/cli/version`, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      saveVersionInfo(versionInfo.version, now);
      return;
    }

    const data = await response.json();
    const latestVersion = data.version;

    saveVersionInfo(versionInfo.version, now);

    if (compareVersions(CURRENT_VERSION, latestVersion)) {
      const updateMessage = boxen(
        chalk.bold("Update Available") +
          "\n\n" +
          chalk.gray(`Current: ${CURRENT_VERSION}`) +
          " → " +
          chalk.green(`Latest: ${latestVersion}`) +
          "\n\n" +
          "To update, run:\n" +
          chalk.cyan("curl -fsSL https://uvacompute.com/install.sh | sh"),
        {
          padding: 1,
          margin: { top: 1, bottom: 1, left: 0, right: 0 },
          borderStyle: "round",
          borderColor: "blue",
        },
      );

      console.log(updateMessage);
    }
  } catch (error) {
    // Silently fail - version check should never block CLI usage
  }
}
