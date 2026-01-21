import { execFileSync, execSync } from "child_process";
import { createHash } from "crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { homedir } from "os";
import { join } from "path";
import { confirm, password, select } from "@inquirer/prompts";
import { SSHKeyAddResponseSchema, SSHKeyListResponseSchema } from "./schemas";
import { theme } from "./theme";
import { getBaseUrl } from "./utils";

const BASE_URL = getBaseUrl();

const UVACOMPUTE_KEY_NAME = "id_ed25519_uvacompute";
const UVACOMPUTE_KEY_PATH = join(homedir(), ".ssh", UVACOMPUTE_KEY_NAME);

const SSH_KEY_PATTERNS = [
  `~/.ssh/${UVACOMPUTE_KEY_NAME}.pub`,
  "~/.ssh/id_ed25519.pub",
  "~/.ssh/id_rsa.pub",
  "~/.ssh/id_ecdsa.pub",
];

export function detectLocalSSHKeys(): string[] {
  const candidates = SSH_KEY_PATTERNS.map((pattern) =>
    pattern.replace("~", homedir()),
  );
  return candidates.filter((path) => existsSync(path));
}

export function getKeyFingerprint(keyPath: string): string {
  try {
    const content = readFileSync(keyPath, "utf-8").trim();
    const parts = content.split(" ");
    if (parts.length < 2 || !parts[1]) return "unknown";

    const keyData = Buffer.from(parts[1], "base64");
    const hash = createHash("sha256").update(keyData).digest("base64");
    return `SHA256:${hash.replace(/=+$/, "")}`;
  } catch {
    return "unknown";
  }
}

export function generateSSHKey(passphrase: string): string {
  const publicKeyPath = `${UVACOMPUTE_KEY_PATH}.pub`;

  if (existsSync(publicKeyPath)) {
    return publicKeyPath;
  }

  if (existsSync(UVACOMPUTE_KEY_PATH)) {
    const publicKey = execSync(`ssh-keygen -y -f "${UVACOMPUTE_KEY_PATH}"`, {
      stdio: "pipe",
    })
      .toString()
      .trim();
    if (!publicKey) {
      throw new Error("Failed to derive public key");
    }
    writeFileSync(publicKeyPath, `${publicKey}\n`, { mode: 0o644 });
    return publicKeyPath;
  }

  const sshDir = join(homedir(), ".ssh");
  if (!existsSync(sshDir)) {
    mkdirSync(sshDir, { recursive: true, mode: 0o700 });
    chmodSync(sshDir, 0o700);
  }

  execFileSync(
    "ssh-keygen",
    [
      "-t",
      "ed25519",
      "-f",
      UVACOMPUTE_KEY_PATH,
      "-N",
      passphrase,
      "-C",
      "uvacompute",
    ],
    { stdio: "pipe" },
  );

  return publicKeyPath;
}

export type GetRegisteredKeysResult =
  | {
      success: true;
      keys: { _id: string; name: string; fingerprint: string }[];
    }
  | { success: false; error: string };

export async function getRegisteredKeys(
  token: string,
): Promise<GetRegisteredKeysResult> {
  try {
    const response = await fetch(`${BASE_URL}/api/ssh-keys`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      return { success: false, error: `API error: ${response.status}` };
    }

    const data = SSHKeyListResponseSchema.parse(await response.json());
    return { success: true, keys: data.keys };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

export async function registerKey(
  token: string,
  keyPath: string,
  name: string,
): Promise<{ success: boolean; fingerprint?: string; error?: string }> {
  if (!existsSync(keyPath)) {
    return { success: false, error: `Key file not found: ${keyPath}` };
  }

  const publicKey = readFileSync(keyPath, "utf-8").trim();

  if (!publicKey) {
    return { success: false, error: "Key file is empty" };
  }

  try {
    const response = await fetch(`${BASE_URL}/api/ssh-keys`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        publicKey,
        name,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error:
          (errorData as { error?: string }).error || "Failed to register key",
      };
    }

    const data = SSHKeyAddResponseSchema.parse(await response.json());
    return { success: true, fingerprint: data.fingerprint };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

export async function ensureSSHKeysConfigured(token: string): Promise<boolean> {
  console.log();
  console.log(theme.warning("No SSH keys configured for VM access."));
  console.log();

  const localKeys = detectLocalSSHKeys();

  type Choice = { name: string; value: string };
  const choices: Choice[] = [];

  choices.push({
    name: "Generate a new SSH key (recommended)",
    value: "generate",
  });

  for (const keyPath of localKeys) {
    const fingerprint = getKeyFingerprint(keyPath);
    const shortPath = keyPath.replace(homedir(), "~");
    choices.push({
      name: `Use ${shortPath} (${fingerprint.substring(0, 20)}...)`,
      value: keyPath,
    });
  }

  choices.push({
    name: "Skip (SSH access will not work)",
    value: "skip",
  });

  const selection = await select({
    message: "How would you like to set up SSH access?",
    choices,
  });

  if (selection === "skip") {
    console.log();
    console.log(
      theme.warning(
        "Skipping SSH setup. You will not be able to SSH into the VM.",
      ),
    );
    console.log(
      theme.muted("You can add a key later with: uva ssh-key add <path>"),
    );
    console.log();
    return false;
  }

  let keyPath: string;
  let keyName: string;

  if (selection === "generate") {
    try {
      const usePassphrase = await confirm({
        message: "Protect this key with a passphrase?",
        default: true,
      });

      let passphrase = "";
      if (usePassphrase) {
        const first = await password({
          message: "Enter passphrase:",
          mask: "*",
        });
        const second = await password({
          message: "Confirm passphrase:",
          mask: "*",
        });

        if (first !== second) {
          console.log(theme.error("Passphrases do not match."));
          return false;
        }

        passphrase = first;
      }

      console.log();
      console.log(theme.muted("Generating SSH key..."));

      keyPath = generateSSHKey(passphrase);
      keyName = "uvacompute";
      console.log(theme.success(`Created ${keyPath.replace(homedir(), "~")}`));

      if (passphrase) {
        const addToAgent = await confirm({
          message: "Add this key to your ssh-agent now?",
          default: true,
        });
        if (addToAgent) {
          try {
            execFileSync("ssh-add", [UVACOMPUTE_KEY_PATH], {
              stdio: "inherit",
            });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown error";
            console.log(
              theme.warning(
                `Couldn't add key to ssh-agent: ${message}. You'll be prompted when you connect.`,
              ),
            );
          }
        } else {
          console.log(
            theme.muted(
              "You may be prompted for the passphrase when connecting via SSH.",
            ),
          );
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.log(theme.error(`Failed to generate SSH key: ${message}`));
      return false;
    }
  } else {
    keyPath = selection;
    const filename = keyPath.split("/").pop() || "key";
    keyName = filename.replace(".pub", "");
  }

  console.log(theme.muted("Registering key with uvacompute..."));

  const result = await registerKey(token, keyPath, keyName);

  if (!result.success) {
    console.log(theme.error(`Failed to register key: ${result.error}`));
    return false;
  }

  console.log(theme.success("SSH key registered successfully!"));
  console.log();

  return true;
}
