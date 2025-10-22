import { format, subDays } from "date-fns";
import type { DayAggregate } from "@/types";
import { getStatusHistory } from "../actions/status-actions";
import { UptimeChart } from "./uptime-chart";

interface UptimeChartWrapperProps {
  days?: number;
}

export async function UptimeChartWrapper({
  days = 90,
}: UptimeChartWrapperProps) {
  try {
    const result = await getStatusHistory(days);

    const allDays: DayAggregate[] = [];
    const today = new Date();
    const dataMap = new Map<string, DayAggregate>(
      result.aggregated.map((d) => [d.date, d]),
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
          uptimePercentage: 0,
          avgResponseTime: 0,
        });
      }
    }

    return <UptimeChart data={allDays} days={days} />;
  } catch (error) {
    console.error("Failed to load uptime history:", error);
    const errorMessage =
      error instanceof Error ? error.message : "failed to load uptime data";

    return (
      <div className="border border-black p-6">
        <div className="text-lg font-medium mb-4">uptime last {days} days</div>
        <div className="border border-red-600 bg-red-50 p-4">
          <div className="font-medium text-red-900 mb-1">
            failed to load chart data
          </div>
          <div className="text-sm text-red-700">{errorMessage}</div>
        </div>
      </div>
    );
  }
}
