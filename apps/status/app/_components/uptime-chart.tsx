"use client";

import { useState } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { DayAggregate } from "@/types";

interface UptimeChartProps {
  data: DayAggregate[];
  days: number;
}

export function UptimeChart({ data, days }: UptimeChartProps) {
  const [hoveredDay, setHoveredDay] = useState<DayAggregate | null>(null);

  function getStatusColor(day: DayAggregate): string {
    if (day.total === 0) return "bg-gray-200";
    if (day.uptimePercentage >= 99) return "bg-green-500";
    if (day.uptimePercentage >= 95) return "bg-yellow-500";
    return "bg-red-600";
  }

  const daysWithData = data.filter((d) => d.total > 0);
  const overallUptime =
    daysWithData.length > 0
      ? daysWithData.reduce((sum, d) => sum + d.uptimePercentage, 0) /
        daysWithData.length
      : 0;

  return (
    <div className="border border-black p-6">
      <div className="flex justify-between items-start mb-4">
        <div className="text-lg font-medium">uptime last {days} days</div>
        <div className="text-sm">
          <span className="text-2xl font-medium">
            {overallUptime.toFixed(2)}%
          </span>
          <span className="text-muted-foreground ml-1">uptime</span>
        </div>
      </div>

      <div className="grid grid-cols-10 gap-1 mb-4">
        {data.map((day) => (
          <div
            key={day.date}
            className={cn(
              "aspect-square cursor-pointer border border-black transition-opacity hover:opacity-80",
              getStatusColor(day),
            )}
            onMouseEnter={() => setHoveredDay(day)}
            onMouseLeave={() => setHoveredDay(null)}
            title={`${format(new Date(day.date), "MMM d, yyyy")}: ${day.uptimePercentage.toFixed(1)}% uptime`}
          />
        ))}
      </div>

      {hoveredDay && hoveredDay.total > 0 && (
        <div className="border border-black p-3 bg-gray-50 text-sm">
          <div className="font-medium mb-1">
            {format(new Date(hoveredDay.date), "MMMM d, yyyy")}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div>uptime:</div>
            <div>{hoveredDay.uptimePercentage.toFixed(2)}%</div>
            <div>checks:</div>
            <div>{hoveredDay.total}</div>
            <div>avg response:</div>
            <div>{hoveredDay.avgResponseTime}ms</div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 text-xs text-muted-foreground mt-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 border border-black" />
          <span>operational</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-yellow-500 border border-black" />
          <span>degraded</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-red-600 border border-black" />
          <span>down</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-gray-200 border border-black" />
          <span>no data</span>
        </div>
      </div>
    </div>
  );
}
