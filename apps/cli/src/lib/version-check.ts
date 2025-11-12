import {
  getBaseUrl,
  loadVersionInfo,
  saveVersionInfo,
  compareVersions,
} from "./utils";
import { theme, createInfoBox } from "./theme";
import { VersionResponseSchema } from "./schemas";
import { PROD_SITE_URL } from "./constants";

const CURRENT_VERSION = require("../../package.json").version;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

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
          theme.accent("uva upgrade") +
          "\n\n" +
          theme.muted(
            `Or manually: curl -fsSL ${PROD_SITE_URL}/install.sh | bash`,
          ),
      );

      console.log(updateMessage);
    }
  } catch (error) {
    // Silently fail - version check should never block CLI usage
  }
}
