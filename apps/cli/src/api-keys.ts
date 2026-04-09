import type { Command } from "commander";
import ora from "ora";
import { confirm } from "./lib/prompt";
import { getBaseUrl, loadToken } from "./lib/utils";
import {
  theme,
  formatSectionHeader,
  formatDetail,
  createInfoBox,
  renderTable,
  formatAge,
} from "./lib/theme";
import {
  ApiKeyListResponseSchema,
  ApiKeyCreateResponseSchema,
  ApiKeyRevokeResponseSchema,
  ApiErrorResponseSchema,
} from "./lib/schemas";

const BASE_URL = getBaseUrl();

async function createApiKey(name: string): Promise<void> {
  const spinner = ora("Creating API key...").start();

  try {
    const token = loadToken();
    if (!token) {
      spinner.fail("Not authenticated. Please run 'uva login' first.");
      process.exit(1);
    }

    const response = await fetch(`${BASE_URL}/api/api-keys`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name }),
    });

    const rawData = await response.json();

    if (!response.ok) {
      const errorData = ApiErrorResponseSchema.parse(rawData);
      spinner.fail(`Failed to create API key: ${errorData.error}`);
      process.exit(1);
    }

    const data = ApiKeyCreateResponseSchema.parse(rawData);

    spinner.succeed(theme.success("API key created!"));

    console.log(
      createInfoBox(
        [
          theme.emphasis("Save these values — they won't be shown again!"),
          "",
          `${theme.muted("API Key:")}        ${data.key}`,
          `${theme.muted("Key Prefix:")}     ${data.keyPrefix}`,
          `${theme.muted("Webhook Secret:")} ${data.webhookSecret}`,
          "",
          theme.muted("GitHub webhook URL:"),
          theme.accent(
            `  https://uvacompute.com/api/github/webhook/${data.keyPrefix}`,
          ),
        ].join("\n"),
      ),
    );
  } catch (error: any) {
    spinner.fail(`Error: ${error.message}`);
    process.exit(1);
  }
}

async function listApiKeys(): Promise<void> {
  const spinner = ora("Fetching API keys...").start();

  try {
    const token = loadToken();
    if (!token) {
      spinner.fail("Not authenticated. Please run 'uva login' first.");
      process.exit(1);
    }

    const response = await fetch(`${BASE_URL}/api/api-keys`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const rawData = await response.json();

    if (!response.ok) {
      const errorData = ApiErrorResponseSchema.parse(rawData);
      spinner.fail(`Failed to fetch API keys: ${errorData.error}`);
      process.exit(1);
    }

    const data = ApiKeyListResponseSchema.parse(rawData);

    spinner.succeed(theme.success("API keys retrieved!"));

    if (data.keys.length === 0) {
      console.log(theme.warning("\nNo API keys found."));
      console.log(theme.muted("Create one with: uva api-key create <name>\n"));
      return;
    }

    console.log();

    const headers = ["NAME", "PREFIX", "GITHUB", "CREATED", "LAST USED"];
    const rows = data.keys.map((key) => [
      key.name,
      theme.accent(key.keyPrefix),
      key.hasGithubToken ? theme.success("yes") : theme.muted("no"),
      formatAge(new Date(key.createdAt)),
      key.lastUsedAt
        ? formatAge(new Date(key.lastUsedAt))
        : theme.muted("never"),
    ]);

    renderTable(headers, rows);
    console.log();
  } catch (error: any) {
    spinner.fail(`Error: ${error.message}`);
    process.exit(1);
  }
}

async function revokeApiKey(
  keyId: string,
  options: { force?: boolean },
): Promise<void> {
  if (!options.force) {
    const confirmed = await confirm({
      message: `Revoke API key ${keyId}? This cannot be undone.`,
      default: false,
    });
    if (!confirmed) {
      console.log(theme.muted("Cancelled."));
      return;
    }
  }

  const spinner = ora(`Revoking API key ${keyId}...`).start();

  try {
    const token = loadToken();
    if (!token) {
      spinner.fail("Not authenticated. Please run 'uva login' first.");
      process.exit(1);
    }

    const response = await fetch(`${BASE_URL}/api/api-keys/${keyId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const rawData = await response.json();

    if (!response.ok) {
      const errorData = ApiErrorResponseSchema.parse(rawData);
      spinner.fail(`Failed to revoke API key: ${errorData.error}`);
      process.exit(1);
    }

    ApiKeyRevokeResponseSchema.parse(rawData);
    spinner.succeed(theme.success(`API key ${keyId} revoked!`));
  } catch (error: any) {
    spinner.fail(`Error: ${error.message}`);
    process.exit(1);
  }
}

export function registerApiKeyCommands(program: Command) {
  const apiKey = program
    .command("api-key")
    .description("Manage API keys for GitHub Actions runners and webhooks");

  apiKey
    .command("create")
    .description("Create a new API key")
    .argument("[name]", "Friendly name for the key", "Unnamed Key")
    .action(createApiKey);

  apiKey
    .command("list")
    .alias("ls")
    .description("List all API keys")
    .action(listApiKeys);

  apiKey
    .command("revoke")
    .alias("rm")
    .description("Revoke an API key")
    .argument("<keyId>", "API key ID to revoke")
    .option("-f, --force", "Skip confirmation prompt")
    .action(revokeApiKey);
}
