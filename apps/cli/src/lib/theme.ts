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
