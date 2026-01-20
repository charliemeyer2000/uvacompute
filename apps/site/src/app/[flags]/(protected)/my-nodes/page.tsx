"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

interface Node {
  _id: string;
  nodeId: string;
  name?: string;
  status: "online" | "offline" | "draining";
  cpus?: number;
  ram?: number;
  gpus?: number;
  lastHeartbeat: number;
  registeredAt: number;
}

interface VM {
  _id: string;
  vmId: string;
  userId: string;
  name?: string;
  cpus: number;
  ram: number;
  gpus: number;
  status: string;
}

interface Job {
  _id: string;
  jobId: string;
  userId: string;
  name?: string;
  image: string;
  cpus: number;
  ram: number;
  gpus: number;
  status: string;
}

interface NodeWithWorkloads extends Node {
  workloads?: { vms: VM[]; jobs: Job[] };
  loadingWorkloads?: boolean;
}

export default function MyNodesPage() {
  const { data: session, isPending } = authClient.useSession();
  const [nodes, setNodes] = useState<NodeWithWorkloads[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedNode, setExpandedNode] = useState<string | null>(null);

  useEffect(() => {
    async function fetchNodes() {
      if (!session?.user) return;

      try {
        const res = await fetch("/api/contributor/nodes");
        if (!res.ok) throw new Error("Failed to fetch nodes");
        const data = await res.json();
        setNodes(data.nodes);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    }

    if (!isPending) {
      fetchNodes();
    }
  }, [session, isPending]);

  async function handlePause(nodeId: string) {
    try {
      const res = await fetch(`/api/contributor/nodes/${nodeId}/pause`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to pause node");
      setNodes((prev) =>
        prev.map((n) =>
          n.nodeId === nodeId ? { ...n, status: "draining" } : n,
        ),
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to pause node");
    }
  }

  async function handleResume(nodeId: string) {
    try {
      const res = await fetch(`/api/contributor/nodes/${nodeId}/resume`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to resume node");
      setNodes((prev) =>
        prev.map((n) => (n.nodeId === nodeId ? { ...n, status: "online" } : n)),
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to resume node");
    }
  }

  async function loadWorkloads(nodeId: string) {
    setNodes((prev) =>
      prev.map((n) =>
        n.nodeId === nodeId ? { ...n, loadingWorkloads: true } : n,
      ),
    );

    try {
      const res = await fetch(`/api/contributor/nodes/${nodeId}/workloads`);
      if (!res.ok) throw new Error("Failed to fetch workloads");
      const workloads = await res.json();
      setNodes((prev) =>
        prev.map((n) =>
          n.nodeId === nodeId
            ? { ...n, workloads, loadingWorkloads: false }
            : n,
        ),
      );
    } catch (err) {
      setNodes((prev) =>
        prev.map((n) =>
          n.nodeId === nodeId ? { ...n, loadingWorkloads: false } : n,
        ),
      );
    }
  }

  function toggleExpand(nodeId: string) {
    if (expandedNode === nodeId) {
      setExpandedNode(null);
    } else {
      setExpandedNode(nodeId);
      const node = nodes.find((n) => n.nodeId === nodeId);
      if (node && !node.workloads) {
        loadWorkloads(nodeId);
      }
    }
  }

  if (isPending || loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-48 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <h2 className="text-xl font-semibold text-red-800 mb-2">Error</h2>
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  const statusColors = {
    online: "bg-green-100 text-green-800",
    offline: "bg-red-100 text-red-800",
    draining: "bg-yellow-100 text-yellow-800",
  };

  const statusIcons = {
    online: "●",
    offline: "○",
    draining: "◐",
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Contributed Nodes</h1>
          <p className="text-gray-600 text-sm mt-1">
            Manage the nodes you&apos;ve contributed to uvacompute
          </p>
        </div>
      </div>

      {nodes.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No nodes yet
          </h3>
          <p className="text-gray-600 mb-4">
            You haven&apos;t contributed any nodes to uvacompute yet.
          </p>
          <p className="text-sm text-gray-500">
            To contribute a node, contact an admin to get an installation token,
            then run the install script on your machine.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {nodes.map((node) => (
            <div
              key={node._id}
              className="bg-white border rounded-lg overflow-hidden"
            >
              <div
                className="p-4 cursor-pointer hover:bg-gray-50"
                onClick={() => toggleExpand(node.nodeId)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span
                      className={`text-lg ${node.status === "online" ? "text-green-500" : node.status === "draining" ? "text-yellow-500" : "text-red-500"}`}
                    >
                      {statusIcons[node.status]}
                    </span>
                    <div>
                      <h3 className="font-semibold">
                        {node.name || node.nodeId}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {node.cpus || 0} CPUs, {node.ram || 0}GB RAM,{" "}
                        {node.gpus || 0} GPUs
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[node.status]}`}
                    >
                      {node.status}
                    </span>
                    <span className="text-gray-400">
                      {expandedNode === node.nodeId ? "▼" : "▶"}
                    </span>
                  </div>
                </div>
              </div>

              {expandedNode === node.nodeId && (
                <div className="border-t px-4 py-4 bg-gray-50">
                  <div className="flex gap-2 mb-4">
                    {node.status === "online" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePause(node.nodeId);
                        }}
                        className="px-3 py-1 text-sm bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200"
                      >
                        Pause Node
                      </button>
                    )}
                    {node.status === "draining" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleResume(node.nodeId);
                        }}
                        className="px-3 py-1 text-sm bg-green-100 text-green-800 rounded hover:bg-green-200"
                      >
                        Resume Node
                      </button>
                    )}
                  </div>

                  <div className="mt-4">
                    <h4 className="font-medium text-sm text-gray-700 mb-2">
                      Active Workloads
                    </h4>
                    {node.loadingWorkloads ? (
                      <p className="text-sm text-gray-500">Loading...</p>
                    ) : node.workloads ? (
                      <div className="space-y-2">
                        {node.workloads.vms.length === 0 &&
                        node.workloads.jobs.length === 0 ? (
                          <p className="text-sm text-gray-500">
                            No active workloads on this node
                          </p>
                        ) : (
                          <>
                            {node.workloads.vms.map((vm) => (
                              <div
                                key={vm._id}
                                className="flex items-center justify-between bg-white p-2 rounded border text-sm"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">
                                    VM
                                  </span>
                                  <span className="font-mono">
                                    {vm.name || vm.vmId.slice(0, 8)}
                                  </span>
                                </div>
                                <span className="text-gray-500">
                                  {vm.cpus}CPU, {vm.ram}GB, {vm.gpus}GPU
                                </span>
                              </div>
                            ))}
                            {node.workloads.jobs.map((job) => (
                              <div
                                key={job._id}
                                className="flex items-center justify-between bg-white p-2 rounded border text-sm"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-800 rounded">
                                    Job
                                  </span>
                                  <span className="font-mono">
                                    {job.name || job.jobId.slice(0, 8)}
                                  </span>
                                </div>
                                <span className="text-gray-500">
                                  {job.cpus}CPU, {job.ram}GB, {job.gpus}GPU
                                </span>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 pt-4 border-t text-xs text-gray-500">
                    <p>Node ID: {node.nodeId}</p>
                    <p>
                      Registered:{" "}
                      {new Date(node.registeredAt).toLocaleDateString()}
                    </p>
                    <p>
                      Last heartbeat:{" "}
                      {new Date(node.lastHeartbeat).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
