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
        uptimePercentage: 100,
        avgResponseTime: 0,
      });
    }
  }

  return <UptimeChart data={allDays} days={days} />;
}
