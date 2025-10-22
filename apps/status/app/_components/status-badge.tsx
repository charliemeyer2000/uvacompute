import { cn } from "@/lib/utils";
import type { ServiceStatus } from "@/types";

interface StatusBadgeProps {
  status: ServiceStatus;
}

const statusConfig = {
  operational: {
    bg: "bg-green-500",
    text: "all systems operational",
    textColor: "text-black",
  },
  degraded: {
    bg: "bg-yellow-500",
    text: "partial outage",
    textColor: "text-black",
  },
  down: {
    bg: "bg-red-600",
    text: "service unavailable",
    textColor: "text-white",
  },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <div className={cn("border border-black p-6", config.bg, config.textColor)}>
      <div className="text-sm uppercase tracking-wide mb-1">status</div>
      <div className="text-2xl font-medium">{config.text}</div>
    </div>
  );
}
