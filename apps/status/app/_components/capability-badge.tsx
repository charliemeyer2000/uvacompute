import { cn } from "@/lib/utils";

interface CapabilityBadgeProps {
  supportsVMs: boolean;
  supportsJobs: boolean;
}

export function CapabilityBadge({
  supportsVMs,
  supportsJobs,
}: CapabilityBadgeProps) {
  const capabilities: string[] = [];
  if (supportsVMs) capabilities.push("vms");
  if (supportsJobs) capabilities.push("jobs");

  if (capabilities.length === 0) {
    return (
      <span className="text-xs text-gray-400 font-mono">no capabilities</span>
    );
  }

  return (
    <span className="text-xs text-gray-500 font-mono">
      supports: {capabilities.join(", ")}
    </span>
  );
}

interface StatusIndicatorProps {
  status: "online" | "offline" | "draining";
}

export function NodeStatusIndicator({ status }: StatusIndicatorProps) {
  const indicators = {
    online: { symbol: "●", color: "text-blue-600" },
    draining: { symbol: "◐", color: "text-yellow-600" },
    offline: { symbol: "○", color: "text-gray-400" },
  };

  const config = indicators[status];

  return (
    <span className={cn("font-mono text-sm", config.color)}>
      {config.symbol}
    </span>
  );
}
