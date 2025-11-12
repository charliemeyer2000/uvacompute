import { getBaseUrl, loadVersionInfo, saveVersionInfo } from "./utils";
import { theme, createInfoBox } from "./theme";
import { VersionResponseSchema } from "./schemas";

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

    const rawData = await response.json();
    const data = VersionResponseSchema.parse(rawData);
    const latestVersion = data.version;

    saveVersionInfo(versionInfo.version, now);

    if (compareVersions(CURRENT_VERSION, latestVersion)) {
      const updateMessage = createInfoBox(
        theme.emphasis("Update Available") +
          "\n\n" +
          theme.muted(`Current: ${CURRENT_VERSION}`) +
          " → " +
          theme.success(`Latest: ${latestVersion}`) +
          "\n\n" +
          "To update, run:\n" +
          theme.accent("curl -fsSL https://uvacompute.com/install.sh | bash"),
      );

      console.log(updateMessage);
    }
  } catch (error) {
    // Silently fail - version check should never block CLI usage
  }
}
