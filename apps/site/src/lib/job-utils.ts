import { JobStatus } from "./job-schemas";

export interface Job {
  _id: string;
  _creationTime: number;
  userId: string;
  jobId: string;
  name?: string;
  image: string;
  command?: string[];
  env?: Record<string, string>;
  cpus: number;
  ram: number;
  gpus: number;
  status: JobStatus;
  exitCode?: number;
  errorMessage?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  nodeId?: string;
  logsUrl?: string;
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

export function formatJobStatus(status: JobStatus): string {
  return status.replace(/_/g, " ");
}

export function getJobStatusColor(status: JobStatus): string {
  switch (status) {
    case "running":
    case "pulling":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "pending":
    case "scheduled":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "completed":
      return "bg-green-100 text-green-800 border-green-200";
    case "failed":
    case "node_offline":
      return "bg-red-100 text-red-800 border-red-200";
    case "cancelled":
      return "bg-gray-100 text-gray-800 border-gray-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
}

export function formatDuration(
  startedAt?: number,
  completedAt?: number,
): string {
  if (!startedAt) {
    return "-";
  }

  const endTime = completedAt || Date.now();
  const durationMs = endTime - startedAt;

  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  const seconds = Math.floor(durationMs / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

export function isJobActive(status: JobStatus): boolean {
  return ["pending", "scheduled", "pulling", "running"].includes(status);
}

export function isJobCancellable(status: JobStatus): boolean {
  return ["pending", "scheduled", "pulling", "running"].includes(status);
}
