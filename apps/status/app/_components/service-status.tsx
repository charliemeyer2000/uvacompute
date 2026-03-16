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

const statusConfig: Record<
  ServiceStatusType,
  { text: string; color: string; dotColor: string }
> = {
  operational: {
    text: "operational",
    color: "text-emerald-600",
    dotColor: "bg-emerald-500",
  },
  degraded: {
    text: "degraded",
    color: "text-amber-600",
    dotColor: "bg-amber-500",
  },
  down: {
    text: "outage",
    color: "text-red-600",
    dotColor: "bg-red-500",
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
    if (day.uptimePercentage >= 99) return "bg-emerald-500";
    if (day.uptimePercentage >= 80) return "bg-emerald-400";
    if (day.uptimePercentage > 0) return "bg-amber-400";
    return "bg-red-500";
  }

  function handleMouseEnter(day: DayAggregate, e: React.MouseEvent) {
    setHoveredDay(day);
    const tooltipWidth = 280;
    const offset = 12;
    const wouldOverflow = e.clientX + tooltipWidth + offset > window.innerWidth;
    setShowLeft(wouldOverflow);
    setMousePosition({ x: e.clientX, y: e.clientY });
  }

  function handleMouseMove(e: React.MouseEvent) {
    const tooltipWidth = 280;
    const offset = 12;
    const wouldOverflow = e.clientX + tooltipWidth + offset > window.innerWidth;
    setShowLeft(wouldOverflow);
    setMousePosition({ x: e.clientX, y: e.clientY });
  }

  return (
    <div className="border border-gray-200 p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <span className={cn("w-2 h-2", config.dotColor)} />
          <span className="font-medium text-sm text-black">{name}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className={cn("text-xs font-medium", config.color)}>
            {config.text}
          </span>
          {responseTime !== undefined && responseTime > 0 && (
            <span className="text-xs text-gray-400">{responseTime}ms</span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex gap-0.5 h-8 sm:h-10 w-full">
          {safeHistoryData.length > 0 ? (
            safeHistoryData.map((day, idx) => (
              <div
                key={`${day.date}-${idx}`}
                className={cn(
                  "h-full cursor-pointer transition-opacity hover:opacity-70",
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
            <div className="flex-1 bg-gray-200" />
          )}
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>30 days ago</span>
          <span>today</span>
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
          <div className="bg-black text-white text-xs p-3 shadow-lg max-w-xs">
            <div className="font-semibold mb-2 text-gray-300">
              {format(new Date(hoveredDay.date), "MMMM d, yyyy")}
            </div>
            {hoveredDay.total > 0 ? (
              <div className="space-y-1">
                <div className="flex justify-between gap-6">
                  <span className="text-gray-400">uptime</span>
                  <span className="font-medium">
                    {hoveredDay.uptimePercentage.toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between gap-6">
                  <span className="text-gray-400">checks</span>
                  <span>
                    {hoveredDay.operational} / {hoveredDay.total}
                  </span>
                </div>
                <div className="flex justify-between gap-6">
                  <span className="text-gray-400">avg response</span>
                  <span>{hoveredDay.avgResponseTime}ms</span>
                </div>
              </div>
            ) : (
              <div className="text-gray-500">no data</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
