"use client";

import { useEffect, useState } from "react";
import { format, subDays } from "date-fns";
import { cn } from "@/lib/utils";

interface DayData {
  date: string;
  operational: number;
  degraded: number;
  down: number;
  total: number;
  uptimePercentage: number;
  avgResponseTime: number;
}

interface UptimeChartProps {
  days?: number;
}

export function UptimeChart({ days = 90 }: UptimeChartProps) {
  const [data, setData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredDay, setHoveredDay] = useState<DayData | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch(`/api/status/history?days=${days}`);
        const result = await response.json();

        const allDays: DayData[] = [];
        const today = new Date();
        const dataMap = new Map<string, DayData>(
          result.aggregated.map((d: DayData) => [d.date, d]),
        );

        for (let i = days - 1; i >= 0; i--) {
          const date = format(subDays(today, i), "yyyy-MM-dd");
          const dayData = dataMap.get(date);

          if (dayData) {
            allDays.push(dayData);
          } else {
            allDays.push({
              date,
              operational: 0,
              degraded: 0,
              down: 0,
              total: 0,
              uptimePercentage: 100,
              avgResponseTime: 0,
            });
          }
        }

        setData(allDays);
      } catch (error) {
        console.error("Failed to fetch uptime data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [days]);

  function getStatusColor(day: DayData): string {
    if (day.total === 0) return "bg-gray-200";
    if (day.uptimePercentage >= 99) return "bg-green-500";
    if (day.uptimePercentage >= 95) return "bg-yellow-500";
    return "bg-red-600";
  }

  const overallUptime =
    data.length > 0
      ? data.reduce((sum, d) => sum + d.uptimePercentage, 0) / data.length
      : 0;

  if (loading) {
    return (
      <div className="border border-black p-6">
        <div className="text-lg font-medium mb-4">uptime last {days} days</div>
        <div className="h-24 flex items-center justify-center text-muted-foreground">
          loading...
        </div>
      </div>
    );
  }

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
