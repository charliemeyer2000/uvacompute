import { readFileSync, writeFileSync, existsSync, copyFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export interface SSHHostConfig {
  hostName: string;
  user: string;
  port: number;
  proxyCommand: string;
  strictHostKeyChecking?: string;
  userKnownHostsFile?: string;
}

const SSH_CONFIG_PATH = join(homedir(), ".ssh", "config");
const SSH_CONFIG_BACKUP_PATH = join(homedir(), ".ssh", "config.backup");

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
  lines.push(`  ProxyCommand ${config.proxyCommand}`);

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
  let existingContent = "";
  let hosts = new Map<string, string[]>();

  if (existsSync(SSH_CONFIG_PATH)) {
    copyFileSync(SSH_CONFIG_PATH, SSH_CONFIG_BACKUP_PATH);
    existingContent = readFileSync(SSH_CONFIG_PATH, "utf-8");
    hosts = parseSSHConfig(existingContent);
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

  writeFileSync(SSH_CONFIG_PATH, finalConfig, "utf-8");
}

export function removeSSHConfig(hostAlias: string): void {
  if (!existsSync(SSH_CONFIG_PATH)) {
    return;
  }

  copyFileSync(SSH_CONFIG_PATH, SSH_CONFIG_BACKUP_PATH);
  const existingContent = readFileSync(SSH_CONFIG_PATH, "utf-8");
  const hosts = parseSSHConfig(existingContent);

  hosts.delete(hostAlias);

  const allLines: string[] = [];
  for (const lines of hosts.values()) {
    allLines.push(...lines);
    allLines.push("");
  }

  writeFileSync(SSH_CONFIG_PATH, allLines.join("\n"), "utf-8");
}
