import {
  readFileSync,
  writeFileSync,
  existsSync,
  copyFileSync,
  mkdirSync,
} from "fs";
import { homedir } from "os";
import { join } from "path";

export interface SSHHostConfig {
  hostName: string;
  user: string;
  port: number;
  strictHostKeyChecking?: string;
  userKnownHostsFile?: string;
}

const SSH_DIR = join(homedir(), ".ssh");
const SSH_CONFIG_PATH = join(SSH_DIR, "config");
const SSH_CONFIG_BACKUP_PATH = join(SSH_DIR, "config.backup");

function ensureSSHDirectory(): void {
  if (!existsSync(SSH_DIR)) {
    try {
      mkdirSync(SSH_DIR, { mode: 0o700, recursive: true });
    } catch (error: any) {
      throw new Error(
        `Failed to create SSH directory at ${SSH_DIR}: ${error.message}`,
      );
    }
  }
}

function parseSSHConfig(content: string): Map<string, string[]> {
  const hosts = new Map<string, string[]>();
  const lines = content.split("\n");
  let currentHost: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("Host ")) {
      if (currentHost !== null) {
        hosts.set(currentHost, currentLines);
      }
      currentHost = trimmed.substring(5).trim();
      currentLines = [line];
    } else if (currentHost !== null) {
      currentLines.push(line);
    }
  }

  if (currentHost !== null) {
    hosts.set(currentHost, currentLines);
  }

  return hosts;
}

function generateHostConfig(
  hostAlias: string,
  config: SSHHostConfig,
): string[] {
  const lines = [`Host ${hostAlias}`];

  lines.push(`  HostName ${config.hostName}`);
  lines.push(`  User ${config.user}`);
  lines.push(`  Port ${config.port}`);

  if (config.strictHostKeyChecking) {
    lines.push(`  StrictHostKeyChecking ${config.strictHostKeyChecking}`);
  }

  if (config.userKnownHostsFile) {
    lines.push(`  UserKnownHostsFile ${config.userKnownHostsFile}`);
  }

  return lines;
}

export function updateSSHConfig(
  hostAlias: string,
  config: SSHHostConfig,
): void {
  try {
    ensureSSHDirectory();

    let existingContent = "";
    let hosts = new Map<string, string[]>();

    if (existsSync(SSH_CONFIG_PATH)) {
      try {
        copyFileSync(SSH_CONFIG_PATH, SSH_CONFIG_BACKUP_PATH);
      } catch (error: any) {
        throw new Error(
          `Failed to create backup of SSH config: ${error.message}`,
        );
      }

      try {
        existingContent = readFileSync(SSH_CONFIG_PATH, "utf-8");
        hosts = parseSSHConfig(existingContent);
      } catch (error: any) {
        throw new Error(`Failed to read SSH config: ${error.message}`);
      }
    }

    const newHostConfig = generateHostConfig(hostAlias, config);
    hosts.set(hostAlias, newHostConfig);

    const otherHosts: string[] = [];
    for (const [host, lines] of hosts.entries()) {
      if (host !== hostAlias) {
        otherHosts.push(...lines);
      }
    }

    const finalConfig = [...newHostConfig, "", ...otherHosts].join("\n");

    try {
      writeFileSync(SSH_CONFIG_PATH, finalConfig, "utf-8");
    } catch (error: any) {
      throw new Error(`Failed to write SSH config: ${error.message}`);
    }
  } catch (error: any) {
    throw new Error(`Failed to update SSH config: ${error.message}`);
  }
}

export function removeSSHConfig(hostAlias: string): void {
  try {
    if (!existsSync(SSH_CONFIG_PATH)) {
      return;
    }

    try {
      copyFileSync(SSH_CONFIG_PATH, SSH_CONFIG_BACKUP_PATH);
    } catch (error: any) {
      throw new Error(
        `Failed to create backup of SSH config: ${error.message}`,
      );
    }

    let existingContent: string;
    try {
      existingContent = readFileSync(SSH_CONFIG_PATH, "utf-8");
    } catch (error: any) {
      throw new Error(`Failed to read SSH config: ${error.message}`);
    }

    const hosts = parseSSHConfig(existingContent);
    hosts.delete(hostAlias);

    const allLines: string[] = [];
    for (const lines of hosts.values()) {
      allLines.push(...lines);
      allLines.push("");
    }

    try {
      writeFileSync(SSH_CONFIG_PATH, allLines.join("\n"), "utf-8");
    } catch (error: any) {
      throw new Error(`Failed to write SSH config: ${error.message}`);
    }
  } catch (error: any) {
    throw new Error(`Failed to remove SSH config: ${error.message}`);
  }
}
