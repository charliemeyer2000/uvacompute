"use client";

import { useState } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { ServiceStatus as ServiceStatusType, DayAggregate } from "@/types";

interface ServiceStatusProps {
  name: string;
  status: ServiceStatusType;
  responseTime?: number;
  historyData?: DayAggregate[];
}

const statusConfig: Record<ServiceStatusType, { text: string; color: string }> =
  {
    operational: {
      text: "Operational",
      color: "text-green-600",
    },
    degraded: {
      text: "Degraded Performance",
      color: "text-yellow-600",
    },
    down: {
      text: "Major Outage",
      color: "text-red-600",
    },
  };

export function ServiceStatus({
  name,
  status,
  responseTime,
  historyData = [],
}: ServiceStatusProps) {
  const [hoveredDay, setHoveredDay] = useState<DayAggregate | null>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const config = statusConfig[status];

  const safeHistoryData = historyData || [];

  console.log("ServiceStatus historyData length:", safeHistoryData.length);
  console.log("First 3 items:", safeHistoryData.slice(0, 3));

  function getBarColor(day: DayAggregate): string {
    if (day.total === 0) return "bg-gray-200";
    if (day.uptimePercentage >= 99.5) return "bg-green-500";
    if (day.uptimePercentage >= 95) return "bg-yellow-500";
    return "bg-red-500";
  }

  function handleMouseEnter(day: DayAggregate, e: React.MouseEvent) {
    setHoveredDay(day);
    setMousePosition({ x: e.clientX, y: e.clientY });
  }

  function handleMouseMove(e: React.MouseEvent) {
    setMousePosition({ x: e.clientX, y: e.clientY });
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4 sm:p-6 hover:border-gray-300 transition-colors bg-white">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
        <div className="flex-shrink-0 lg:w-44">
          <div className="font-medium text-base">{name}</div>
          <div className="lg:hidden mt-2">
            <div className={cn("text-sm font-medium", config.color)}>
              {config.text}
            </div>
            {responseTime !== undefined && status !== "down" && (
              <div className="text-xs text-gray-500 mt-0.5">
                {responseTime}ms
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-2 min-w-0">
          <div className="flex gap-px h-8 w-full bg-gray-100 rounded overflow-hidden">
            {safeHistoryData.length > 0 ? (
              safeHistoryData.map((day, idx) => (
                <div
                  key={`${day.date}-${idx}`}
                  className={cn(
                    "h-full cursor-pointer transition-all hover:opacity-70",
                    getBarColor(day),
                  )}
                  onMouseEnter={(e) => handleMouseEnter(day, e)}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={() => setHoveredDay(null)}
                  style={{
                    flex: 1,
                    minWidth: "2px",
                  }}
                />
              ))
            ) : (
              <div className="flex-1 bg-gray-300" />
            )}
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>90 days ago</span>
            <span>Today</span>
          </div>
        </div>

        <div className="hidden lg:block flex-shrink-0 lg:w-36 text-right">
          <div className={cn("font-medium text-sm", config.color)}>
            {config.text}
          </div>
          {responseTime !== undefined && status !== "down" && (
            <div className="text-xs text-gray-500 mt-0.5">{responseTime}ms</div>
          )}
        </div>
      </div>

      {hoveredDay && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            left: `${mousePosition.x + 12}px`,
            top: `${mousePosition.y + 12}px`,
          }}
        >
          <div className="bg-black text-white text-xs rounded px-3 py-2 shadow-lg max-w-xs">
            <div className="font-medium mb-1">
              {format(new Date(hoveredDay.date), "MMM d, yyyy")}
            </div>
            {hoveredDay.total > 0 ? (
              <div className="space-y-0.5">
                <div>Uptime: {hoveredDay.uptimePercentage.toFixed(2)}%</div>
                <div>Avg Response: {hoveredDay.avgResponseTime}ms</div>
                <div>Checks: {hoveredDay.total}</div>
              </div>
            ) : (
              <div className="text-gray-400">No data available</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
