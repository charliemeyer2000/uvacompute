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
      color: "text-blue-600",
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
  const [showLeft, setShowLeft] = useState(false);
  const config = statusConfig[status];

  const safeHistoryData = historyData || [];

  function getBarColor(day: DayAggregate): string {
    if (day.total === 0) return "bg-gray-200";
    if (day.uptimePercentage >= 99.5) return "bg-blue-500";
    if (day.uptimePercentage >= 95) return "bg-yellow-500";
    return "bg-red-500";
  }

  function handleMouseEnter(day: DayAggregate, e: React.MouseEvent) {
    setHoveredDay(day);
    const tooltipWidth = 320;
    const offset = 12;
    const wouldOverflow = e.clientX + tooltipWidth + offset > window.innerWidth;
    setShowLeft(wouldOverflow);
    setMousePosition({ x: e.clientX, y: e.clientY });
  }

  function handleMouseMove(e: React.MouseEvent) {
    const tooltipWidth = 320;
    const offset = 12;
    const wouldOverflow = e.clientX + tooltipWidth + offset > window.innerWidth;
    setShowLeft(wouldOverflow);
    setMousePosition({ x: e.clientX, y: e.clientY });
  }

  return (
    <div className="border-b border-gray-200 py-4 sm:py-6 last:border-b-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 mb-3">
        <div className="font-medium text-sm sm:text-base text-gray-900">
          {name}
        </div>
        <div className={cn("font-medium text-xs sm:text-sm", config.color)}>
          {config.text}
        </div>
      </div>

      <div className="flex flex-col gap-2 overflow-hidden">
        <div className="flex gap-0.5 h-8 sm:h-10 w-full">
          {safeHistoryData.length > 0 ? (
            safeHistoryData.map((day, idx) => (
              <div
                key={`${day.date}-${idx}`}
                className={cn(
                  "h-full cursor-pointer transition-opacity hover:opacity-70 rounded-sm",
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
            <div className="flex-1 bg-gray-200 rounded-sm" />
          )}
        </div>
        <div className="flex justify-between text-xs text-gray-500">
          <span>90 days ago</span>
          <span>Today</span>
        </div>
      </div>

      {hoveredDay && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            left: `${mousePosition.x}px`,
            top: `${mousePosition.y + 12}px`,
            transform: showLeft
              ? "translateX(calc(-100% - 12px))"
              : "translateX(12px)",
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
