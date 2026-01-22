import { VMStatus } from "./vm-schemas";

export interface VM {
  _id: string;
  _creationTime: number;
  userId: string;
  vmId: string;
  name?: string;
  cpus: number;
  ram: number;
  disk: number;
  gpus: number;
  gpuType: string;
  status: VMStatus;
  hours: number;
  createdAt: number;
  expiresAt: number;
  deletedAt?: number;
  nodeId?: string;
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

export function formatTimeRemaining(expiresAt: number): string {
  const now = Date.now();
  const remaining = expiresAt - now;

  if (remaining <= 0) {
    return "Expired";
  }

  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m remaining`;
  }
  return `${minutes}m remaining`;
}

export function formatStatus(status: VMStatus): string {
  return status.replace(/_/g, " ");
}

export function getStatusColor(status: VMStatus): string {
  switch (status) {
    case "ready":
      return "bg-green-100 text-green-800 border-green-200";
    case "creating":
    case "pending":
    case "booting":
    case "provisioning":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "failed":
    case "offline":
      return "bg-red-100 text-red-800 border-red-200";
    case "stopping":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "stopped":
    case "not_found":
      return "bg-gray-100 text-gray-800 border-gray-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
}
