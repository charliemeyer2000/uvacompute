import { cn } from "@/lib/utils";
import type { ServiceStatus } from "@/types";

interface StatusBadgeProps {
  status: ServiceStatus;
  lastUpdate: Date;
}

const statusConfig = {
  operational: {
    text: "all systems operational",
    dotColor: "bg-emerald-500",
    textColor: "text-emerald-700",
  },
  degraded: {
    text: "partial outage",
    dotColor: "bg-amber-500",
    textColor: "text-amber-700",
  },
  down: {
    text: "service unavailable",
    dotColor: "bg-red-500",
    textColor: "text-red-700",
  },
};

export function StatusBadge({ status, lastUpdate }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <div className="py-6">
      <div className="flex items-center gap-3 mb-2">
        <span className={cn("w-3 h-3 shrink-0", config.dotColor)} />
        <h2 className={cn("text-xl sm:text-2xl font-medium", config.textColor)}>
          {config.text}
        </h2>
      </div>
      <p className="text-xs text-gray-400 ml-6">
        updated {lastUpdate.toLocaleTimeString()}
      </p>
    </div>
  );
}
