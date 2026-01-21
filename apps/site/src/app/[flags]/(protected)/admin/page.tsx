"use client";

import { useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { authClient } from "@/lib/auth-client";

export default function AdminPage() {
  const { data: session, isPending } = authClient.useSession();

  const isAdmin = useQuery(api.devAccess.hasDevAccess);
  const nodes = useQuery(api.nodes.listAll, isAdmin ? {} : "skip");
  const allVMs = useQuery(api.vms.listAll, isAdmin ? {} : "skip");
  const allJobs = useQuery(api.jobs.listAll, isAdmin ? {} : "skip");

  const resources = useMemo(() => {
    if (!nodes || !allVMs || !allJobs) return null;

    const onlineNodes = nodes.filter((n) => n.status === "online");

    const totalCpus = onlineNodes.reduce((sum, n) => sum + (n.cpus || 0), 0);
    const totalRam = onlineNodes.reduce((sum, n) => sum + (n.ram || 0), 0);
    const totalGpus = onlineNodes.reduce((sum, n) => sum + (n.gpus || 0), 0);

    const activeVms = allVMs.filter(
      (vm) =>
        vm.status !== "deleted" &&
        vm.status !== "expired" &&
        vm.status !== "failed",
    );
    const activeJobs = allJobs.filter(
      (job) =>
        job.status !== "completed" &&
        job.status !== "failed" &&
        job.status !== "cancelled",
    );

    const usedCpus =
      activeVms.reduce((sum, vm) => sum + (vm.cpus || 0), 0) +
      activeJobs.reduce((sum, job) => sum + (job.cpus || 0), 0);
    const usedRam =
      activeVms.reduce((sum, vm) => sum + (vm.ram || 0), 0) +
      activeJobs.reduce((sum, job) => sum + (job.ram || 0), 0);
    const usedGpus =
      activeVms.reduce((sum, vm) => sum + (vm.gpus || 0), 0) +
      activeJobs.reduce((sum, job) => sum + (job.gpus || 0), 0);

    return {
      nodes: {
        total: nodes.length,
        online: onlineNodes.length,
        offline: nodes.filter((n) => n.status === "offline").length,
        draining: nodes.filter((n) => n.status === "draining").length,
      },
      cpus: {
        total: totalCpus,
        used: usedCpus,
        available: totalCpus - usedCpus,
      },
      ram: {
        total: totalRam,
        used: usedRam,
        available: totalRam - usedRam,
      },
      gpus: {
        total: totalGpus,
        used: usedGpus,
        available: totalGpus - usedGpus,
      },
      workloads: {
        activeVms: activeVms.length,
        activeJobs: activeJobs.length,
      },
    };
  }, [nodes, allVMs, allJobs]);

  const activeVms = useMemo(() => {
    if (!allVMs) return [];
    return allVMs.filter(
      (vm) =>
        vm.status !== "deleted" &&
        vm.status !== "expired" &&
        vm.status !== "failed",
    );
  }, [allVMs]);

  const activeJobs = useMemo(() => {
    if (!allJobs) return [];
    return allJobs.filter(
      (job) =>
        job.status !== "completed" &&
        job.status !== "failed" &&
        job.status !== "cancelled",
    );
  }, [allJobs]);

  const setNodeStatus = useMutation(api.nodes.setStatusAsAdmin);

  async function handleDrain(nodeId: string) {
    try {
      await setNodeStatus({ nodeId, status: "draining" });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to drain node");
    }
  }

  async function handleUncordon(nodeId: string) {
    try {
      await setNodeStatus({ nodeId, status: "online" });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to uncordon node");
    }
  }

  if (isPending || isAdmin === undefined) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <h2 className="text-xl font-semibold text-red-800 mb-2">
            Access Denied
          </h2>
          <p className="text-red-600">
            You do not have admin access to this page.
          </p>
        </div>
      </div>
    );
  }

  const loading = !nodes || !allVMs || !allJobs;

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  const statusColors = {
    online: "bg-green-100 text-green-800",
    offline: "bg-red-100 text-red-800",
    draining: "bg-yellow-100 text-yellow-800",
  };

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
      </div>

      {/* Resource Summary */}
      {resources && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border rounded-lg p-4">
            <div className="text-sm text-gray-500">Nodes</div>
            <div className="text-2xl font-bold">
              {resources.nodes.online}/{resources.nodes.total}
            </div>
            <div className="text-xs text-gray-400">online</div>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <div className="text-sm text-gray-500">CPUs</div>
            <div className="text-2xl font-bold">
              {resources.cpus.used}/{resources.cpus.total}
            </div>
            <div className="text-xs text-gray-400">used</div>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <div className="text-sm text-gray-500">RAM (GB)</div>
            <div className="text-2xl font-bold">
              {resources.ram.used}/{resources.ram.total}
            </div>
            <div className="text-xs text-gray-400">used</div>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <div className="text-sm text-gray-500">GPUs</div>
            <div className="text-2xl font-bold">
              {resources.gpus.used}/{resources.gpus.total}
            </div>
            <div className="text-xs text-gray-400">used</div>
          </div>
        </div>
      )}

      {/* Nodes Table */}
      <div className="bg-white border rounded-lg">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Nodes ({nodes.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Node ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  CPUs
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  RAM
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  GPUs
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {nodes.map((node) => (
                <tr key={node._id}>
                  <td className="px-4 py-3 text-sm font-mono">
                    {node.name || node.nodeId}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[node.status as keyof typeof statusColors]}`}
                    >
                      {node.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">{node.cpus || "-"}</td>
                  <td className="px-4 py-3 text-sm">
                    {node.ram ? `${node.ram}GB` : "-"}
                  </td>
                  <td className="px-4 py-3 text-sm">{node.gpus || 0}</td>
                  <td className="px-4 py-3">
                    {node.status === "online" ? (
                      <button
                        onClick={() => handleDrain(node.nodeId)}
                        className="text-sm text-yellow-600 hover:text-yellow-800"
                      >
                        Drain
                      </button>
                    ) : node.status === "draining" ? (
                      <button
                        onClick={() => handleUncordon(node.nodeId)}
                        className="text-sm text-green-600 hover:text-green-800"
                      >
                        Resume
                      </button>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {nodes.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    No nodes registered
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Active Workloads */}
      <div className="bg-white border rounded-lg">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">
            Active Workloads ({activeVms.length + activeJobs.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Node
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Resources
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {activeVms.map((vm) => (
                <tr key={vm._id}>
                  <td className="px-4 py-3 text-sm font-mono">
                    {vm.name || vm.vmId.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                      VM
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">{vm.status}</td>
                  <td className="px-4 py-3 text-sm font-mono">
                    {vm.nodeId || "-"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {vm.cpus}CPU, {vm.ram}GB, {vm.gpus}GPU
                  </td>
                </tr>
              ))}
              {activeJobs.map((job) => (
                <tr key={job._id}>
                  <td className="px-4 py-3 text-sm font-mono">
                    {job.name || job.jobId.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                      Job
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">{job.status}</td>
                  <td className="px-4 py-3 text-sm font-mono">
                    {job.nodeId || "-"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {job.cpus}CPU, {job.ram}GB, {job.gpus}GPU
                  </td>
                </tr>
              ))}
              {activeVms.length === 0 && activeJobs.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    No active workloads
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
