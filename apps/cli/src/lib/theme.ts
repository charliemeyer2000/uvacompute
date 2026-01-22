import chalk from "chalk";
import boxen from "boxen";

/**
 * Standardized color palette for the CLI
 *
 * Usage guidelines:
 * - success: Positive outcomes, confirmations (green)
 * - warning: Alerts, non-critical issues (yellow)
 * - error: Critical failures, errors (red)
 * - info/primary: Section headers, titles (blue)
 * - muted: Secondary text, details, hints (gray)
 * - accent: Commands, URLs, interactive elements (cyan)
 * - emphasis: Important text, highlights (bold)
 */
export const theme = {
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  info: chalk.blue,
  muted: chalk.gray,
  accent: chalk.cyan,
  emphasis: chalk.bold,
  primary: chalk.blue,
} as const;

export const statusColors = {
  not_found: chalk.gray,
  pending: chalk.yellow,
  booting: chalk.blue,
  provisioning: chalk.blue,
  ready: chalk.green,
  stopping: chalk.yellow,
  stopped: chalk.gray,
  failed: chalk.red,
  offline: chalk.red,
} as const;

export const jobStatusColors = {
  pending: chalk.yellow,
  scheduled: chalk.yellow,
  pulling: chalk.blue,
  running: chalk.blue,
  completed: chalk.green,
  failed: chalk.red,
  cancelled: chalk.gray,
  node_offline: chalk.red,
} as const;

export function createInfoBox(content: string): string {
  return boxen(content, {
    padding: 1,
    margin: { top: 1, bottom: 1, left: 0, right: 0 },
    borderStyle: "round",
    borderColor: "blue",
  });
}

export function formatSectionHeader(text: string): string {
  return theme.info(`\n${text}:`);
}

export function formatDetail(label: string, value: string): string {
  return theme.muted(`  ${label}: ${value}`);
}

export function formatCommand(command: string): string {
  return theme.accent(`  ${command}`);
}

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, "");
}

export function formatAge(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return "0m";
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function renderTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((header, index) => {
    const cellWidths = rows.map((row) => stripAnsi(row[index] ?? "").length);
    return Math.max(header.length, ...cellWidths);
  });

  const renderRow = (cols: string[]) =>
    cols
      .map((col, index) => {
        const padding = (widths[index] ?? 0) - stripAnsi(col).length;
        return `${col}${" ".repeat(Math.max(0, padding + 2))}`;
      })
      .join("")
      .trimEnd();

  console.log(renderRow(headers.map((h) => theme.muted(h))));
  for (const row of rows) {
    console.log(renderRow(row));
  }
}

export function formatStatusBullet(
  status: "success" | "warning" | "error" | "info" | "muted",
  label: string,
): string {
  const colors = {
    success: theme.success,
    warning: theme.warning,
    error: theme.error,
    info: theme.info,
    muted: theme.muted,
  };
  return `${colors[status]("●")} ${label}`;
}
