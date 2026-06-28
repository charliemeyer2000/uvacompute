/**
 * Shared formatting utilities for dates, durations, and status strings.
 *
 * Both VM and Job modules previously carried their own copies of these
 * helpers. This module is the single source of truth.
 */

/**
 * Format a Unix-epoch millisecond timestamp as a locale-appropriate string.
 */
export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

/**
 * Replace underscores with spaces so enum-style statuses read naturally.
 *
 * @example formatStatus("node_offline") // "node offline"
 */
export function formatStatus(status: string): string {
  return status.replace(/_/g, " ");
}

/**
 * Express a millisecond duration as a compact human-readable string.
 *
 * Returns the most granular useful representation:
 *   <1 s  → "123ms"
 *   <1 m  → "45s"
 *   <1 h  → "12m 5s"
 *   ≥1 h  → "3h 12m"
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;

  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Describe how much time remains until {@link expiresAt} (ms epoch).
 *
 * Returns `"expired"` when the deadline has passed,
 * otherwise a compact countdown like `"2h 15m remaining"`.
 */
export function formatTimeRemaining(expiresAt: number, now?: number): string {
  const currentTime = now ?? Date.now();
  const remaining = expiresAt - currentTime;

  if (remaining <= 0) return "expired";

  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
}
