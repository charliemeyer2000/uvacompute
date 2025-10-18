"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { authClient } from "@/lib/auth-client";

interface VM {
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
  status:
    | "creating"
    | "running"
    | "failed"
    | "deleting"
    | "deleted"
    | "expired";
  hours: number;
  createdAt: number;
  expiresAt: number;
  deletedAt?: number;
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

function formatTimeRemaining(expiresAt: number) {
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

function getStatusColor(status: VM["status"]) {
  switch (status) {
    case "running":
      return "bg-green-100 text-green-800 border-green-200";
    case "creating":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "failed":
      return "bg-red-100 text-red-800 border-red-200";
    case "deleting":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "deleted":
    case "expired":
      return "bg-gray-100 text-gray-800 border-gray-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
}

function VMCard({ vm, isActive }: { vm: VM; isActive: boolean }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            {vm.name || "Unnamed VM"}
          </h3>
          <p className="text-sm text-gray-500 font-mono">{vm.vmId}</p>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(vm.status)}`}
        >
          {vm.status.toUpperCase()}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs text-gray-500">CPUs</p>
          <p className="text-sm font-medium text-gray-900">{vm.cpus} vCPU</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">RAM</p>
          <p className="text-sm font-medium text-gray-900">{vm.ram} GB</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Disk</p>
          <p className="text-sm font-medium text-gray-900">{vm.disk} GB</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">GPUs</p>
          <p className="text-sm font-medium text-gray-900">
            {vm.gpus > 0 ? `${vm.gpus}x ${vm.gpuType}` : "None"}
          </p>
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4 space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Created:</span>
          <span className="text-gray-900">{formatDate(vm.createdAt)}</span>
        </div>
        {isActive && (
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Expires:</span>
            <span className="text-gray-900 font-medium">
              {formatTimeRemaining(vm.expiresAt)}
            </span>
          </div>
        )}
        {!isActive && vm.deletedAt && (
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Deleted:</span>
            <span className="text-gray-900">{formatDate(vm.deletedAt)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VMList() {
  const { data: session } = authClient.useSession();
  const activeVMs = useQuery(
    api.vms.listActiveByUser,
    session?.user?.id ? { userId: session.user.id } : "skip",
  );
  const inactiveVMs = useQuery(
    api.vms.listInactiveByUser,
    session?.user?.id ? { userId: session.user.id } : "skip",
  );

  if (!session?.user?.id) {
    return null;
  }

  const isLoading = activeVMs === undefined || inactiveVMs === undefined;

  return (
    <div className="space-y-8">
      {/* Active VMs */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Active VMs</h2>
          {activeVMs && (
            <span className="text-sm text-gray-500">
              {activeVMs.length} {activeVMs.length === 1 ? "VM" : "VMs"}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="bg-gray-50 rounded-lg p-8 text-center">
            <p className="text-gray-500">Loading VMs...</p>
          </div>
        ) : activeVMs && activeVMs.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeVMs.map((vm) => (
              <VMCard key={vm._id} vm={vm} isActive={true} />
            ))}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-8 text-center border border-gray-200">
            <p className="text-gray-500 mb-2">No active VMs</p>
            <p className="text-sm text-gray-400">
              Create a VM using the CLI:{" "}
              <code className="bg-gray-200 px-2 py-1 rounded">
                uva vm create -h 1
              </code>
            </p>
          </div>
        )}
      </div>

      {/* Inactive VMs */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">VM History</h2>
          {inactiveVMs && (
            <span className="text-sm text-gray-500">
              {inactiveVMs.length} {inactiveVMs.length === 1 ? "VM" : "VMs"}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="bg-gray-50 rounded-lg p-8 text-center">
            <p className="text-gray-500">Loading history...</p>
          </div>
        ) : inactiveVMs && inactiveVMs.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {inactiveVMs.map((vm) => (
              <VMCard key={vm._id} vm={vm} isActive={false} />
            ))}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-8 text-center border border-gray-200">
            <p className="text-gray-500">No VM history</p>
          </div>
        )}
      </div>
    </div>
  );
}
