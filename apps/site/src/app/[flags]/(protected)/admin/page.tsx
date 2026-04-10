"use client";

import { useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { authClient } from "@/lib/auth-client";

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}

function isStaleHeartbeat(timestamp: number): boolean {
  const fiveMinutes = 5 * 60 * 1000;
  return Date.now() - timestamp > fiveMinutes;
}

export default function AdminPage() {
  const { data: session, isPending } = authClient.useSession();

  const isAdmin = useQuery(api.devAccess.hasDevAccess);
  const nodes = useQuery(api.nodes.listAll, isAdmin ? {} : "skip");
  const allVMs = useQuery(api.vms.listAll, isAdmin ? {} : "skip");
  const allJobs = useQuery(api.jobs.listAll, isAdmin ? {} : "skip");
  const earlyAccessRequests = useQuery(
    api.earlyAccess.listEarlyAccessRequests,
    isAdmin ? {} : "skip",
  );
  const pendingTokens = useQuery(
    api.earlyAccess.listPendingTokens,
    isAdmin ? {} : "skip",
  );

  const forceCleanup = useMutation(api.nodes.forceCleanup);
  const grantAccess = useMutation(api.earlyAccess.grantAccess);
  const revokeAccess = useMutation(api.earlyAccess.revokeAccess);
  const approveTokenByEmail = useMutation(
    api.earlyAccessTokens.approveTokenByEmail,
  );
  const denyTokenByEmail = useMutation(api.earlyAccessTokens.denyTokenByEmail);

  const offlineNodes = useMemo(() => {
    if (!nodes) return [];
    return nodes.filter((n) => n.status === "offline");
  }, [nodes]);

  const resources = useMemo(() => {
    if (!nodes || !allVMs || !allJobs) return null;

    const onlineNodes = nodes.filter((n) => n.status === "online");

    const totalCpus = onlineNodes.reduce((sum, n) => sum + (n.cpus || 0), 0);
    const totalRam = onlineNodes.reduce((sum, n) => sum + (n.ram || 0), 0);
    const totalGpus = onlineNodes.reduce((sum, n) => sum + (n.gpus || 0), 0);

    const activeVms = allVMs.filter(
      (vm) =>
        vm.status !== "stopped" &&
        vm.status !== "failed" &&
        vm.status !== "offline",
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
      queuedJobs: allJobs.filter((job) => job.status === "queued").length,
    };
  }, [nodes, allVMs, allJobs]);

  const activeVms = useMemo(() => {
    if (!allVMs) return [];
    return allVMs.filter(
      (vm) =>
        vm.status !== "stopped" &&
        vm.status !== "failed" &&
        vm.status !== "offline",
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

  async function handleCleanup(nodeId: string) {
    if (
      !confirm(
        "This will force-delete all VMs and cancel all jobs on this node. Continue?",
      )
    ) {
      return;
    }
    try {
      const result = await forceCleanup({ nodeId });
      alert(
        `Cleaned up: ${result.vmsDeleted} VMs deleted, ${result.jobsCancelled} jobs cancelled`,
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to cleanup node");
    }
  }

  async function handleGrantAccess(userId: string, email: string) {
    try {
      await grantAccess({ userId });
      alert(`Access granted to ${email}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to grant access");
    }
  }

  async function handleRevokeAccess(userId: string, email: string) {
    try {
      await revokeAccess({ userId });
      alert(`Access revoked from ${email}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to revoke access");
    }
  }

  async function handleApproveToken(email: string) {
    try {
      await approveTokenByEmail({ email });
      alert(`Token approved for ${email}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to approve token");
    }
  }

  async function handleDenyToken(email: string) {
    try {
      await denyTokenByEmail({ email });
      alert(`Token denied for ${email}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to deny token");
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

      {/* Health Alert Banner */}
      {offlineNodes.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <span className="text-red-600 font-semibold">
              ⚠ Node Health Alert
            </span>
          </div>
          <p className="text-red-700 text-sm mt-1">
            {offlineNodes.length} node
            {offlineNodes.length > 1 ? "s are" : " is"} offline:{" "}
            {offlineNodes.map((n) => n.name || n.nodeId).join(", ")}
          </p>
          <p className="text-red-600 text-xs mt-2">
            Workloads on offline nodes may be affected. Use the cleanup action
            to force-delete workloads on dead nodes.
          </p>
        </div>
      )}

      {/* Resource Summary */}
      {resources && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
          <div className="bg-white border rounded-lg p-4">
            <div className="text-sm text-gray-500">Runner Queue</div>
            <div className="text-2xl font-bold">{resources.queuedJobs}</div>
            <div className="text-xs text-gray-400">
              {resources.queuedJobs === 0 ? "empty" : "waiting"}
            </div>
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
                  Last Seen
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
              {nodes.map((node) => {
                const stale = isStaleHeartbeat(node.lastHeartbeat);
                return (
                  <tr key={node._id} className={stale ? "bg-red-50" : ""}>
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
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={
                          stale ? "text-red-600 font-medium" : "text-gray-600"
                        }
                      >
                        {formatRelativeTime(node.lastHeartbeat)}
                      </span>
                      {stale && (
                        <span className="ml-1 text-xs text-red-500">⚠</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">{node.cpus || "-"}</td>
                    <td className="px-4 py-3 text-sm">
                      {node.ram ? `${node.ram}GB` : "-"}
                    </td>
                    <td className="px-4 py-3 text-sm">{node.gpus || 0}</td>
                    <td className="px-4 py-3 space-x-2">
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
                      ) : node.status === "offline" ? (
                        <button
                          onClick={() => handleCleanup(node.nodeId)}
                          className="text-sm text-red-600 hover:text-red-800"
                        >
                          Cleanup
                        </button>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {nodes.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
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

      {/* Early Access Management */}
      <div className="bg-white border rounded-lg">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Early Access Management</h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage user access to the platform
          </p>
        </div>

        {/* Pending Requests */}
        <div className="p-4 border-b">
          <h3 className="text-base font-medium mb-2">
            Pending Requests (not signed up)
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            Users who requested access but haven't created an account yet
          </p>
          {pendingTokens === undefined ? (
            <div className="text-center py-4">
              <p className="text-sm text-gray-500">Loading...</p>
            </div>
          ) : pendingTokens.length === 0 ? (
            <div className="text-center py-4 border border-gray-200 rounded">
              <p className="text-sm text-gray-500">No pending requests</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pendingTokens.map((token) => (
                <div
                  key={token._id}
                  className="border border-gray-200 p-3 rounded flex items-start justify-between"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{token.email}</p>
                      {token.approved ? (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">
                          pre-approved
                        </span>
                      ) : (
                        <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                          awaiting decision
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{token.reason}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      requested {new Date(token.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {token.approved ? (
                      <button
                        onClick={() => handleDenyToken(token.email)}
                        className="px-3 py-1 text-sm text-red-600 border border-red-200 rounded hover:bg-red-50"
                      >
                        Deny
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => handleApproveToken(token.email)}
                          className="px-3 py-1 text-sm text-green-600 border border-green-200 rounded hover:bg-green-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleDenyToken(token.email)}
                          className="px-3 py-1 text-sm text-red-600 border border-red-200 rounded hover:bg-red-50"
                        >
                          Deny
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Registered Users */}
        <div className="p-4">
          <h3 className="text-base font-medium mb-2">Registered Users</h3>
          <p className="text-xs text-gray-500 mb-4">
            Users who have created accounts
          </p>
          {earlyAccessRequests === undefined ? (
            <div className="text-center py-4">
              <p className="text-sm text-gray-500">Loading...</p>
            </div>
          ) : earlyAccessRequests.length === 0 ? (
            <div className="text-center py-4 border border-gray-200 rounded">
              <p className="text-sm text-gray-500">No users found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {earlyAccessRequests.map(
                (user: {
                  _id: string;
                  name: string;
                  email: string;
                  hasEarlyAccess: boolean;
                  emailVerified: boolean;
                  createdAt: number;
                  hasApprovedToken: boolean;
                }) => (
                  <div
                    key={user._id}
                    className="border border-gray-200 p-3 rounded flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{user.name}</p>
                        {user.hasEarlyAccess && (
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">
                            approved
                          </span>
                        )}
                        {!user.hasEarlyAccess && (
                          <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                            pending
                          </span>
                        )}
                        {!user.emailVerified && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                            unverified
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">{user.email}</p>
                      <p className="text-xs text-gray-400">
                        signed up{" "}
                        {new Date(user.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {user.hasEarlyAccess ? (
                        <button
                          onClick={() =>
                            handleRevokeAccess(user._id, user.email)
                          }
                          className="px-3 py-1 text-sm text-red-600 border border-red-200 rounded hover:bg-red-50"
                        >
                          Revoke
                        </button>
                      ) : (
                        <button
                          onClick={() =>
                            handleGrantAccess(user._id, user.email)
                          }
                          className="px-3 py-1 text-sm text-green-600 border border-green-200 rounded hover:bg-green-50"
                        >
                          Approve
                        </button>
                      )}
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
