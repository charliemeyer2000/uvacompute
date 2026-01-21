import type { NodeStatus, ClusterResources } from "@/types";
import { CapabilityBadge, NodeStatusIndicator } from "./capability-badge";
import { formatDistanceToNow } from "date-fns";

interface NodeListProps {
  nodes: NodeStatus[];
  nodeCounts: ClusterResources["nodes"];
}

function formatGPUDisplay(gpus: number, gpuType: string): string {
  if (gpus === 0 || gpuType === "none" || gpuType === "unknown") {
    return "no gpu";
  }
  const formattedType = gpuType
    .replace(/^nvidia-/, "")
    .replace(/-/g, " ")
    .toUpperCase();
  return `${gpus}× ${formattedType}`;
}

export function NodeList({ nodes, nodeCounts }: NodeListProps) {
  const sortedNodes = [...nodes].sort((a, b) => {
    const statusOrder = { online: 0, draining: 1, offline: 2 };
    return statusOrder[a.status] - statusOrder[b.status];
  });

  const statusSummary = [];
  if (nodeCounts.online > 0) statusSummary.push(`${nodeCounts.online} online`);
  if (nodeCounts.draining > 0)
    statusSummary.push(`${nodeCounts.draining} draining`);
  if (nodeCounts.offline > 0)
    statusSummary.push(`${nodeCounts.offline} offline`);

  return (
    <div className="border border-gray-200 p-4 sm:p-6 mb-6 sm:mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-gray-900">nodes</h2>
        <span className="text-xs text-gray-500 font-mono">
          {statusSummary.join(" · ")}
        </span>
      </div>

      {sortedNodes.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          no nodes registered
        </div>
      ) : (
        <div className="space-y-3">
          {sortedNodes.map((node) => (
            <div
              key={node.name}
              className="border border-gray-100 p-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <NodeStatusIndicator status={node.status} />
                  <span className="font-mono text-sm text-gray-900">
                    {node.name}
                  </span>
                  <span
                    className={`text-xs font-mono px-1.5 py-0.5 ${
                      node.status === "online"
                        ? "bg-blue-50 text-blue-600"
                        : node.status === "draining"
                          ? "bg-yellow-50 text-yellow-600"
                          : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {node.status}
                  </span>
                </div>
                <div className="text-xs text-gray-500 font-mono">
                  {node.vcpus} vcpu · {node.ram} gb ·{" "}
                  {formatGPUDisplay(node.gpus, node.gpuType)}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <CapabilityBadge
                  supportsVMs={node.supportsVMs}
                  supportsJobs={node.supportsJobs}
                />
                {node.status === "offline" && (
                  <span className="text-xs text-gray-400 font-mono">
                    last seen{" "}
                    {formatDistanceToNow(new Date(node.lastHeartbeat), {
                      addSuffix: true,
                    })}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
