import { VMExtendResponseSchema, VMStatus } from "./vm-schemas";

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
  exposePort?: number;
  exposeSubdomain?: string;
  exposeUrl?: string;
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

export function getSshCommand(vm: VM): string {
  return `uva vm ssh ${vm.name || vm.vmId}`;
}

export async function deleteVm(
  vmId: string,
): Promise<{ success: boolean; error?: string }> {
  const response = await fetch(`/api/vms/${vmId}`, {
    method: "DELETE",
  });

  const data = await response.json();

  if (!response.ok || data.status !== "deletion_success") {
    return { success: false, error: data.msg || "failed to delete vm" };
  }

  return { success: true };
}

export async function extendVm(
  vmId: string,
  hours: number,
): Promise<{ success: boolean; expiresAt?: number; error?: string }> {
  const response = await fetch(`/api/vms/${vmId}/extend`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ hours }),
  });

  const rawData = await response.json();

  if (!response.ok) {
    return {
      success: false,
      error: rawData.msg || rawData.error || "failed to extend vm",
    };
  }

  const data = VMExtendResponseSchema.parse(rawData);

  if (data.status !== "extend_success") {
    return { success: false, error: data.msg || "failed to extend vm" };
  }

  return { success: true, expiresAt: data.expiresAt };
}
