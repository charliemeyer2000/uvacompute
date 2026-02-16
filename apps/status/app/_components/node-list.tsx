import type { NodeStatus, ClusterResources } from "@/types";
import { CapabilityBadge } from "./capability-badge";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface NodeListProps {
  nodes: NodeStatus[];
  nodeCounts: ClusterResources["nodes"];
}

function formatGPUDisplay(gpus: number, gpuType: string): string {
  if (gpus === 0 || gpuType === "none" || gpuType === "unknown") {
    return "—";
  }
  const formattedType = gpuType
    .replace(/^nvidia-/, "")
    .replace(/-/g, " ")
    .toUpperCase();
  return `${gpus}× ${formattedType}`;
}

const statusIndicators = {
  online: { symbol: "●", color: "text-green-500", label: "online" },
  draining: { symbol: "◐", color: "text-yellow-500", label: "draining" },
  offline: { symbol: "○", color: "text-gray-300", label: "offline" },
};

export function NodeList({ nodes, nodeCounts }: NodeListProps) {
  const sortedNodes = [...nodes].sort((a, b) => {
    const statusOrder = { online: 0, draining: 1, offline: 2 };
    return statusOrder[a.status] - statusOrder[b.status];
  });

  return (
    <div className="border border-gray-200 p-5 sm:p-6">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          nodes
        </h2>
        <div className="flex-1 h-px bg-gray-200" />
        <div className="flex items-center gap-3 text-xs text-gray-400">
          {nodeCounts.online > 0 && (
            <span className="flex items-center gap-1">
              <span className="text-green-500">●</span>
              {nodeCounts.online}
            </span>
          )}
          {nodeCounts.draining > 0 && (
            <span className="flex items-center gap-1">
              <span className="text-yellow-500">◐</span>
              {nodeCounts.draining}
            </span>
          )}
          {nodeCounts.offline > 0 && (
            <span className="flex items-center gap-1">
              <span className="text-gray-300">○</span>
              {nodeCounts.offline}
            </span>
          )}
        </div>
      </div>

      {sortedNodes.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400">
          no nodes registered
        </div>
      ) : (
        <div className="space-y-2">
          {sortedNodes.map((node) => {
            const indicator = statusIndicators[node.status];
            return (
              <div
                key={node.name}
                className={cn(
                  "border p-3 transition-colors",
                  node.status === "offline"
                    ? "border-gray-100 bg-gray-50"
                    : "border-gray-200 hover:border-black",
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn("text-sm", indicator.color)}>
                      {indicator.symbol}
                    </span>
                    <span className="font-medium text-sm text-black truncate">
                      {node.name}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 text-right shrink-0">
                    <div>
                      {node.vcpus} cpu · {node.ram} gb
                    </div>
                    <div>
                      {formatGPUDisplay(node.gpus, node.gpuType)}
                      {node.gpuBusy && (
                        <span className="ml-1.5 text-yellow-500">in use</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <CapabilityBadge
                    supportsVMs={node.supportsVMs}
                    supportsJobs={node.supportsJobs}
                  />
                  {node.status === "offline" && (
                    <span className="text-xs text-gray-400">
                      last seen{" "}
                      {formatDistanceToNow(new Date(node.lastHeartbeat), {
                        addSuffix: true,
                      })}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
