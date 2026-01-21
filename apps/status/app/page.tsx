import { subDays } from "date-fns";
import { StatusContent } from "./_components/status-content";
import {
  getStatus,
  getStatusHistory,
  getClusterStatus,
} from "./actions/status-actions";
import type { DayAggregate, ClusterStatus } from "@/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function StatusPage() {
  let initialData;
  let historyData: DayAggregate[] = [];
  let clusterStatus: ClusterStatus | null = null;
  let loadError = null;

  try {
    initialData = await getStatus();
  } catch (error) {
    console.error("Failed to load initial status:", error);
    loadError =
      error instanceof Error ? error.message : "failed to load status data";
    initialData = {
      current: {
        status: "down" as const,
        responseTime: 0,
        timestamp: Date.now(),
        error: loadError,
      },
      history: [],
      uptime: 0,
    };
  }

  try {
    clusterStatus = await getClusterStatus();
  } catch (error) {
    console.error("Failed to load cluster status:", error);
  }

  try {
    const days = 30;
    const result = await getStatusHistory(days);
    const today = new Date();
    const dataMap = new Map<string, DayAggregate>(
      result.aggregated.map((d) => [d.date, d]),
    );

    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(today, i).toISOString().split("T")[0];
      const dayData = dataMap.get(date);

      if (dayData) {
        historyData.push(dayData);
      } else {
        historyData.push({
          date,
          operational: 0,
          degraded: 0,
          down: 0,
          total: 0,
          uptimePercentage: 0,
          avgResponseTime: 0,
          expectedChecks: 0,
        });
      }
    }
  } catch (error) {
    console.error("Failed to load history data:", error);
  }

  return (
    <div className="min-h-screen bg-white p-3 sm:p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8">
        {loadError && (
          <div className="border border-red-600 bg-red-50 p-4 mb-6 rounded-lg">
            <div className="font-medium text-red-900 mb-1">
              Failed to load status data
            </div>
            <div className="text-sm text-red-700">{loadError}</div>
          </div>
        )}

        <StatusContent
          initialData={initialData}
          historyData={historyData}
          initialClusterStatus={clusterStatus}
        />

        <div className="pt-4 sm:pt-6 mt-6 sm:mt-8">
          <div className="text-xs sm:text-sm text-gray-600">
            <p className="mb-2">
              This page shows the real-time status of uvacompute services and
              cluster resources.
            </p>
            <p>
              Monitoring checks run every minute. Historical data is retained
              for 30 days.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
