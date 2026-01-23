/**
 * Centralized status color utilities for consistent UI across jobs, VMs, and nodes.
 *
 * Color semantics:
 * - Green: Active/Running/Ready/Online/Completed (success/working states)
 * - Blue: Pending/Creating/Provisioning/Scheduled/Pulling (in-progress states)
 * - Yellow: Stopping/Draining (transitional states)
 * - Red: Failed/Error/Offline/Node_offline (error states)
 * - Gray: Cancelled/Stopped/Not_found (neutral inactive states)
 */

// ============================================================================
// Status Categories
// ============================================================================

/**
 * Statuses that represent an active, running, or successful state.
 * Color: Green
 */
const ACTIVE_STATUSES = [
  // Jobs
  "running",
  "completed",
  // VMs
  "ready",
  // Nodes
  "online",
] as const;

/**
 * Statuses that represent a pending, in-progress, or transitioning-forward state.
 * Color: Blue
 */
const PENDING_STATUSES = [
  // Jobs
  "pending",
  "scheduled",
  "pulling",
  // VMs
  "creating",
  "booting",
  "provisioning",
  // Note: VM "pending" is also in this category
] as const;

/**
 * Statuses that represent a transitional or warning state.
 * Color: Yellow
 */
const WARNING_STATUSES = [
  // VMs
  "stopping",
  // Nodes
  "draining",
] as const;

/**
 * Statuses that represent an error or failure state.
 * Color: Red
 */
const ERROR_STATUSES = [
  // Jobs
  "failed",
  "node_offline",
  // VMs
  "offline",
  // Nodes - "offline" is covered above
] as const;

/**
 * Statuses that represent a neutral inactive state.
 * Color: Gray
 */
const INACTIVE_STATUSES = [
  // Jobs
  "cancelled",
  // VMs
  "stopped",
  "not_found",
] as const;

// ============================================================================
// Color Utilities
// ============================================================================

type StatusCategory = "active" | "pending" | "warning" | "error" | "inactive";

function getStatusCategory(status: string): StatusCategory {
  const normalizedStatus = status.toLowerCase();

  if ((ACTIVE_STATUSES as readonly string[]).includes(normalizedStatus)) {
    return "active";
  }
  if (
    (PENDING_STATUSES as readonly string[]).includes(normalizedStatus) ||
    normalizedStatus === "pending"
  ) {
    return "pending";
  }
  if ((WARNING_STATUSES as readonly string[]).includes(normalizedStatus)) {
    return "warning";
  }
  if (
    (ERROR_STATUSES as readonly string[]).includes(normalizedStatus) ||
    normalizedStatus === "failed" ||
    normalizedStatus === "offline"
  ) {
    return "error";
  }
  return "inactive";
}

/**
 * Get the dot/indicator color for a status (e.g., the small circle next to status text).
 * Returns a Tailwind bg-* class.
 */
export function getStatusDotColor(status: string): string {
  switch (getStatusCategory(status)) {
    case "active":
      return "bg-green-500";
    case "pending":
      return "bg-blue-500";
    case "warning":
      return "bg-yellow-500";
    case "error":
      return "bg-red-500";
    case "inactive":
    default:
      return "bg-gray-400";
  }
}

/**
 * Get the left border color for a status (e.g., the colored left edge on cards).
 * Returns a Tailwind border-l-* class.
 */
export function getStatusBorderColor(status: string): string {
  switch (getStatusCategory(status)) {
    case "active":
      return "border-l-green-500";
    case "pending":
      return "border-l-blue-500";
    case "warning":
      return "border-l-yellow-500";
    case "error":
      return "border-l-red-500";
    case "inactive":
    default:
      return "border-l-gray-300";
  }
}

/**
 * Get the text color for a status.
 * Returns a Tailwind text-* class.
 */
export function getStatusTextColor(status: string): string {
  switch (getStatusCategory(status)) {
    case "active":
      return "text-green-600";
    case "pending":
      return "text-blue-600";
    case "warning":
      return "text-yellow-600";
    case "error":
      return "text-red-600";
    case "inactive":
    default:
      return "text-gray-500";
  }
}

/**
 * Get the badge/pill colors for a status (background, text, and border).
 * Returns combined Tailwind classes for bg-*, text-*, and border-*.
 */
export function getStatusBadgeColor(status: string): string {
  switch (getStatusCategory(status)) {
    case "active":
      return "bg-green-50 text-green-700 border-green-200";
    case "pending":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "warning":
      return "bg-yellow-50 text-yellow-700 border-yellow-200";
    case "error":
      return "bg-red-50 text-red-700 border-red-200";
    case "inactive":
    default:
      return "bg-gray-50 text-gray-600 border-gray-200";
  }
}

/**
 * Get the full badge color with stronger background (for VM-style badges).
 * Returns combined Tailwind classes for bg-*, text-*, and border-*.
 */
export function getStatusBadgeColorStrong(status: string): string {
  switch (getStatusCategory(status)) {
    case "active":
      return "bg-green-100 text-green-800 border-green-200";
    case "pending":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "warning":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "error":
      return "bg-red-100 text-red-800 border-red-200";
    case "inactive":
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
}
