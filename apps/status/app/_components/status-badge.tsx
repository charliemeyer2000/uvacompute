import { cn } from "@/lib/utils";
import type { ServiceStatus } from "@/types";

interface StatusBadgeProps {
  status: ServiceStatus;
}

const statusConfig = {
  operational: {
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={3}
          d="M5 13l4 4L19 7"
        />
      </svg>
    ),
    text: "All Systems Operational",
    textColor: "text-green-700",
    iconBg: "bg-green-100",
    iconColor: "text-green-700",
  },
  degraded: {
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
    ),
    text: "Partial Outage",
    textColor: "text-yellow-700",
    iconBg: "bg-yellow-100",
    iconColor: "text-yellow-700",
  },
  down: {
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={3}
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    ),
    text: "Service Unavailable",
    textColor: "text-red-700",
    iconBg: "bg-red-100",
    iconColor: "text-red-700",
  },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-4 p-6 mb-8 border border-gray-200 rounded-lg bg-gray-50">
      <div
        className={cn(
          "w-12 h-12 rounded-full flex items-center justify-center shrink-0",
          config.iconBg,
          config.iconColor,
        )}
      >
        {config.icon}
      </div>
      <div>
        <div className="text-sm text-gray-500 uppercase tracking-wide mb-1">
          Current Status
        </div>
        <div className={cn("text-2xl font-semibold", config.textColor)}>
          {config.text}
        </div>
      </div>
    </div>
  );
}
