"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { getStatusBorderColor, getStatusDotColor } from "@/lib/status-colors";
import { ChevronDown, ChevronRight, Server, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "motion/react";

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

export default function MyNodesPage() {
  const { data: session, isPending } = authClient.useSession();
  const [expandedNode, setExpandedNode] = useState<string | null>(null);

  const nodes = useQuery(
    api.nodes.listByOwner,
    session?.user?.id ? { ownerId: session.user.id } : "skip",
  );

  const workloads = useQuery(
    api.nodes.getWorkloadsOnNode,
    expandedNode ? { nodeId: expandedNode } : "skip",
  );

  const drainingNodeIds = useMemo(
    () =>
      nodes?.filter((n) => n.status === "draining").map((n) => n.nodeId) ?? [],
    [nodes],
  );

  const drainingWorkloadCounts = useQuery(
    api.nodes.getWorkloadCountsForNodes,
    drainingNodeIds.length > 0 ? { nodeIds: drainingNodeIds } : "skip",
  );

  const setNodeStatus = useMutation(api.nodes.setStatusAsOwner);

  async function handlePause(nodeId: string) {
    try {
      await setNodeStatus({ nodeId, status: "draining" });
      toast.success("node paused", {
        description: "node is now draining workloads",
      });
    } catch (err) {
      toast.error("failed to pause node", {
        description: err instanceof Error ? err.message : "unknown error",
      });
    }
  }

  async function handleResume(nodeId: string) {
    try {
      await setNodeStatus({ nodeId, status: "online" });
      toast.success("node resumed", {
        description: "node is now accepting workloads",
      });
    } catch (err) {
      toast.error("failed to resume node", {
        description: err instanceof Error ? err.message : "unknown error",
      });
    }
  }

  function toggleExpand(nodeId: string) {
    setExpandedNode(expandedNode === nodeId ? null : nodeId);
  }

  // Count online and offline nodes
  const onlineCount = nodes?.filter((n) => n.status === "online").length ?? 0;
  const offlineCount = nodes?.filter((n) => n.status === "offline").length ?? 0;
  const drainingCount =
    nodes?.filter((n) => n.status === "draining").length ?? 0;

  if (isPending || nodes === undefined) {
    return (
      <div className="space-y-6">
        {/* Page Header Skeleton */}
        <div className="flex items-center justify-between flex-wrap gap-y-2">
          <div>
            <div className="h-8 w-48 bg-gray-100 animate-pulse mb-2" />
            <div className="h-4 w-72 bg-gray-100 animate-pulse" />
          </div>
          <div className="flex gap-4">
            <div className="h-4 w-20 bg-gray-100 animate-pulse" />
            <div className="h-4 w-20 bg-gray-100 animate-pulse" />
          </div>
        </div>

        {/* Cards Skeleton */}
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="bg-white border border-gray-200 border-l-4 border-l-gray-200 p-5"
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="h-5 w-5 bg-gray-100 animate-pulse rounded" />
                  <div>
                    <div className="h-5 w-32 bg-gray-100 animate-pulse mb-1" />
                    <div className="h-3 w-48 bg-gray-100 animate-pulse" />
                  </div>
                </div>
                <div className="h-5 w-16 bg-gray-100 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-y-2">
        <div>
          <h1 className="text-2xl font-semibold text-black">
            contributed nodes
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            manage the nodes you&apos;ve contributed to uvacompute
          </p>
        </div>

        {/* Stats Summary */}
        {nodes.length > 0 && (
          <div className="flex items-center gap-3 sm:gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-gray-500">{onlineCount} online</span>
            </div>
            {drainingCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-yellow-500" />
                <span className="text-gray-500">{drainingCount} draining</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-gray-500">{offlineCount} offline</span>
            </div>
          </div>
        )}
      </div>

      {nodes.length === 0 ? (
        <div className="border border-gray-200 bg-white p-6 sm:p-12 text-center">
          <div className="mx-auto w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mb-4">
            <Server className="w-6 h-6 text-gray-400" />
          </div>
          <h2 className="text-lg font-semibold text-black mb-2">
            no nodes yet
          </h2>
          <p className="text-sm text-gray-500 mb-4 max-w-md mx-auto">
            you haven&apos;t contributed any nodes to uvacompute yet.
          </p>
          <p className="text-xs text-gray-400">
            to contribute a node, contact an admin to get an installation token,
            then run the install script on your machine.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {nodes.map((node) => (
            <div
              key={node._id}
              className={`bg-white border border-gray-200 border-l-4 ${getStatusBorderColor(node.status)} overflow-hidden hover:border-gray-300 transition-colors`}
            >
              {/* Node Header - Clickable */}
              <div
                className="p-5 cursor-pointer"
                onClick={() => toggleExpand(node.nodeId)}
              >
                <div className="flex items-center justify-between flex-wrap gap-y-2">
                  <div className="flex items-center gap-4">
                    <span className="text-gray-400">
                      {expandedNode === node.nodeId ? (
                        <ChevronDown className="w-5 h-5" />
                      ) : (
                        <ChevronRight className="w-5 h-5" />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-black">
                        {node.name || node.nodeId}
                      </h3>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {node.cpus || 0} CPUs, {node.ram || 0} GB RAM,{" "}
                        {node.gpus || 0} GPUs
                        {node.gpuBusy && (
                          <span className="ml-2 text-yellow-600 font-medium">
                            GPU in use
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {node.status === "draining" &&
                      drainingWorkloadCounts?.[node.nodeId] && (
                        <span
                          className={`text-xs px-2 py-0.5 ${
                            drainingWorkloadCounts[node.nodeId].vmCount +
                              drainingWorkloadCounts[node.nodeId].jobCount ===
                            0
                              ? "text-green-700 bg-green-50 border border-green-200"
                              : "text-yellow-700 bg-yellow-50 border border-yellow-200"
                          }`}
                        >
                          {(() => {
                            const counts = drainingWorkloadCounts[node.nodeId];
                            const total = counts.vmCount + counts.jobCount;
                            if (total === 0) return "ready to offline";
                            const parts = [];
                            if (counts.vmCount > 0)
                              parts.push(
                                `${counts.vmCount} VM${counts.vmCount > 1 ? "s" : ""}`,
                              );
                            if (counts.jobCount > 0)
                              parts.push(
                                `${counts.jobCount} job${counts.jobCount > 1 ? "s" : ""}`,
                              );
                            return `${parts.join(", ")} draining`;
                          })()}
                        </span>
                      )}
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${getStatusDotColor(node.status)}`}
                      />
                      <span className="text-xs text-gray-600">
                        {node.status}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Expanded Content */}
              <AnimatePresence initial={false}>
                {expandedNode === node.nodeId && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-gray-100 px-5 py-4 bg-gray-50/50">
                      {/* Actions */}
                      <div className="flex gap-2 mb-4">
                        {node.status === "online" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePause(node.nodeId);
                            }}
                            className="text-yellow-700 border-yellow-200 hover:bg-yellow-50"
                          >
                            <Pause className="w-3.5 h-3.5 mr-1.5" />
                            pause node
                          </Button>
                        )}
                        {node.status === "draining" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResume(node.nodeId);
                            }}
                            className="text-green-700 border-green-200 hover:bg-green-50"
                          >
                            <Play className="w-3.5 h-3.5 mr-1.5" />
                            resume node
                          </Button>
                        )}
                      </div>

                      {/* Active Workloads */}
                      <div className="mb-4">
                        <h4 className="text-xs text-gray-400 uppercase tracking-wide mb-2">
                          active workloads
                        </h4>
                        {workloads === undefined ? (
                          <div className="text-xs text-gray-400">
                            loading...
                          </div>
                        ) : workloads.vms.length === 0 &&
                          workloads.jobs.length === 0 ? (
                          <div className="text-xs text-gray-400">
                            no active workloads on this node
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {workloads.vms.map((vm: VM) => (
                              <div
                                key={vm._id}
                                className="flex items-center justify-between flex-wrap gap-y-2 bg-white p-3 border border-gray-200"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="px-1.5 py-0.5 text-[10px] uppercase tracking-wide bg-blue-100 text-blue-700 font-medium">
                                    vm
                                  </span>
                                  <span className="text-xs font-mono text-black">
                                    {vm.name || vm.vmId.slice(0, 12)}
                                  </span>
                                </div>
                                <span className="text-xs text-gray-400">
                                  {vm.cpus} CPU, {vm.ram} GB, {vm.gpus} GPU
                                </span>
                              </div>
                            ))}
                            {workloads.jobs.map((job: Job) => (
                              <div
                                key={job._id}
                                className="flex items-center justify-between flex-wrap gap-y-2 bg-white p-3 border border-gray-200"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="px-1.5 py-0.5 text-[10px] uppercase tracking-wide bg-purple-100 text-purple-700 font-medium">
                                    job
                                  </span>
                                  <span className="text-xs font-mono text-black">
                                    {job.name || job.jobId.slice(0, 12)}
                                  </span>
                                </div>
                                <span className="text-xs text-gray-400">
                                  {job.cpus} CPU, {job.ram} GB, {job.gpus} GPU
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Node Details */}
                      <div className="border-t border-gray-200 pt-3 space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-400">node id</span>
                          <span className="text-gray-600 font-mono">
                            {node.nodeId}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">registered</span>
                          <span className="text-gray-600">
                            {new Date(node.registeredAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">last heartbeat</span>
                          <span className="text-gray-600">
                            {new Date(node.lastHeartbeat).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
