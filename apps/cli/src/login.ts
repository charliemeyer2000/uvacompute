import type { Command } from "commander";
import ora from "ora";
import open from "open";
import { getBaseUrl, saveToken, loadToken, validateToken } from "./lib/utils";
import { theme, createInfoBox } from "./lib/theme";
import { type TokenSuccessResponse } from "./lib/types";
import {
  CLIENT_ID,
  DEFAULT_DEVICE_EXPIRES_SECONDS,
  DEFAULT_DEVICE_POLL_INTERVAL_SECONDS,
} from "./lib/constants";
import { DeviceCodeResponseSchema, TokenResponseSchema } from "./lib/schemas";

const BASE_URL = getBaseUrl();

async function deviceAuthorization(): Promise<TokenSuccessResponse> {
  let spinner = ora("Requesting device authorization...").start();

  try {
    const deviceResponse = await fetch(`${BASE_URL}/api/auth/device/code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        scope: "openid profile email",
      }),
    });

    if (!deviceResponse.ok) {
      throw new Error(
        `HTTP ${deviceResponse.status}: ${deviceResponse.statusText}`,
      );
    }

    const rawDeviceData = await deviceResponse.json();
    const deviceData = DeviceCodeResponseSchema.parse(rawDeviceData);
    const {
      device_code,
      user_code,
      verification_uri,
      verification_uri_complete,
      interval = DEFAULT_DEVICE_POLL_INTERVAL_SECONDS,
    } = deviceData;

    spinner.succeed("Device authorization requested");
    spinner.stop();

    const authBox = createInfoBox(
      theme.emphasis("CLI Authentication Required") +
        "\n\n" +
        theme.muted("Visit: ") +
        theme.accent(verification_uri) +
        "\n\n" +
        theme.muted("Enter code: ") +
        theme.emphasis(user_code) +
        "\n\n" +
        "Waiting for verification...",
    );

    console.log(authBox);

    const urlToOpen = `${verification_uri}/approve?user_code=${user_code}`;

    try {
      await open(urlToOpen);
      console.log(theme.muted("Browser opened automatically\n"));
    } catch (error) {
      console.log(
        theme.warning(
          "Could not open browser automatically. Please visit the URL above manually.\n",
        ),
      );
    }

    spinner = ora(
      `Waiting for authorization (expires in ${Math.floor((deviceData.expires_in || DEFAULT_DEVICE_EXPIRES_SECONDS) / 60)} minutes)...`,
    ).start();

    return await pollForToken(device_code, interval, spinner);
  } catch (error: any) {
    spinner.fail(`Error: ${error.message}`);
    throw error;
  }
}

async function pollForToken(
  deviceCode: string,
  interval: number,
  spinner: any,
): Promise<TokenSuccessResponse> {
  let pollingInterval = interval;

  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const tokenResponse = await fetch(`${BASE_URL}/api/auth/device/token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            device_code: deviceCode,
            client_id: CLIENT_ID,
          }),
        });

        const rawToken = await tokenResponse.json();
        const tokenData = TokenResponseSchema.parse(rawToken);

        if (tokenResponse.ok && "access_token" in tokenData) {
          spinner.succeed("Authorization successful!");

          const accessToken = tokenData.access_token;

          try {
            const userResponse = await fetch(`${BASE_URL}/api/auth/session`, {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            });

            if (userResponse.ok) {
              const userData = await userResponse.json();
              const user = (userData as any).user;
              if (user) {
                console.log(
                  theme.success(
                    `Welcome, ${user.name || user.email || "User"}!`,
                  ),
                );
              }
            }
          } catch (error) {}

          saveToken(accessToken);

          resolve(tokenData);
          return;
        } else if ("error" in tokenData) {
          switch (tokenData.error) {
            case "authorization_pending":
              break;
            case "slow_down":
              pollingInterval += 5;
              spinner.text = `Slowing down polling to ${pollingInterval}s intervals...`;
              break;
            case "access_denied":
              spinner.fail("Access was denied by the user");
              reject(new Error("Access denied"));
              return;
            case "expired_token":
              spinner.fail("The device code has expired. Please try again.");
              reject(new Error("Device code expired"));
              return;
            default:
              spinner.fail(
                `Error: ${tokenData.error_description || tokenData.error}`,
              );
              reject(new Error(tokenData.error_description || tokenData.error));
              return;
          }
        }
      } catch (error: any) {
        if (error.name === "FetchError" || error.code === "ECONNREFUSED") {
          spinner.fail(
            "Could not connect to authentication server. Make sure the server is running.",
          );
          reject(new Error("Connection failed"));
          return;
        }
      }

      setTimeout(poll, pollingInterval * 1000);
    };

    poll();
  });
}

export function registerLoginCommand(program: Command) {
  program
    .command("login")
    .description("Login to uvacompute")
    .option("--force", "Force re-authentication even if already logged in")
    .action(async (options) => {
      try {
        if (!options.force) {
          const existingToken = loadToken();
          if (existingToken) {
            const spinner = ora("Validating token...").start();
            const isValid = await validateToken(existingToken, BASE_URL);
            spinner.stop();

            if (isValid) {
              console.log(theme.success("Already logged in!"));
              console.log(
                theme.muted(`Token: ${existingToken.substring(0, 20)}...`),
              );
              console.log(theme.muted("\nUse --force to re-authenticate\n"));
              return;
            } else {
              console.log(
                theme.warning(
                  "Existing token is invalid or expired. Please log in again.\n",
                ),
              );
            }
          }
        }

        await deviceAuthorization();

        console.log(theme.success("\nAuthentication successful!"));
        console.log(theme.muted("You are now logged in to uvacompute.\n"));
      } catch (error: any) {
        console.error(theme.error("\nAuthentication failed."));
        process.exit(1);
      }
    });
}
