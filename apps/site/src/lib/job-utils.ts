import { JobStatus } from "./job-schemas";
import {
  formatDate,
  formatStatus,
  formatDuration as formatDurationMs,
} from "./format";

export { formatDate };

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
  disk?: number;
  status: JobStatus;
  exitCode?: number;
  errorMessage?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  nodeId?: string;
  logsUrl?: string;
  exposePort?: number;
  exposeSubdomain?: string;
  exposeUrl?: string;
  source?: "cli" | "api" | "github";
  githubMeta?: {
    repoFullName: string;
    workflowJobId: number;
    workflowJobUrl?: string;
  };
}

export function formatJobStatus(status: JobStatus): string {
  return formatStatus(status);
}

export function formatDuration(
  startedAt?: number,
  completedAt?: number,
): string {
  if (!startedAt) return "-";
  return formatDurationMs((completedAt || Date.now()) - startedAt);
}

export function isJobActive(status: JobStatus): boolean {
  return ["queued", "pending", "scheduled", "pulling", "running"].includes(
    status,
  );
}

export function isJobCancellable(status: JobStatus): boolean {
  return ["queued", "pending", "scheduled", "pulling", "running"].includes(
    status,
  );
}
