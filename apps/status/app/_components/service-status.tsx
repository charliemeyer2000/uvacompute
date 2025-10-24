import { cn } from "@/lib/utils";
import type { ServiceStatus } from "@/types";

interface ServiceStatusProps {
  name: string;
  status: ServiceStatus;
  responseTime?: number;
}

const statusConfig: Record<ServiceStatus, { dot: string; text: string }> = {
  operational: {
    dot: "bg-green-500",
    text: "operational",
  },
  degraded: {
    dot: "bg-yellow-500",
    text: "degraded performance",
  },
  down: {
    dot: "bg-red-600",
    text: "down",
  },
};

export function ServiceStatus({
  name,
  status,
  responseTime,
}: ServiceStatusProps) {
  const config = statusConfig[status];

  return (
    <div className="border border-black p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn("w-3 h-3 flex-shrink-0", config.dot)} />
        <div className="min-w-0">
          <div className="text-base font-medium break-words">{name}</div>
          <div className="text-sm text-muted-foreground">{config.text}</div>
        </div>
      </div>
      {responseTime !== undefined && status !== "down" && (
        <div className="text-sm text-muted-foreground sm:ml-auto">
          {responseTime}ms
        </div>
      )}
    </div>
  );
}
