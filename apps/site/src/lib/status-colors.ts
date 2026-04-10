// Centralized status colors for jobs, VMs, and nodes.
// Green=active/success, Blue=pending, Yellow=transitional, Red=error, Gray=inactive

const ACTIVE_STATUSES = ["running", "completed", "ready", "online"] as const;
const PENDING_STATUSES = [
  "queued",
  "pending",
  "scheduled",
  "pulling",
  "creating",
  "booting",
  "provisioning",
] as const;
const WARNING_STATUSES = ["stopping", "draining"] as const;
const ERROR_STATUSES = ["failed", "node_offline", "offline"] as const;

type StatusCategory = "active" | "pending" | "warning" | "error" | "inactive";

function getStatusCategory(status: string): StatusCategory {
  const s = status.toLowerCase();
  if ((ACTIVE_STATUSES as readonly string[]).includes(s)) return "active";
  if ((PENDING_STATUSES as readonly string[]).includes(s)) return "pending";
  if ((WARNING_STATUSES as readonly string[]).includes(s)) return "warning";
  if ((ERROR_STATUSES as readonly string[]).includes(s)) return "error";
  return "inactive";
}

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
    default:
      return "bg-gray-400";
  }
}

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
    default:
      return "border-l-gray-300";
  }
}

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
    default:
      return "text-gray-500";
  }
}

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
    default:
      return "bg-gray-50 text-gray-600 border-gray-200";
  }
}

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
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
}
