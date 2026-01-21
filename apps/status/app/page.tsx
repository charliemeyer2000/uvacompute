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
    <div className="min-h-screen bg-white">
      <div className="border-b border-black">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-black">
                uvacompute
              </h1>
              <p className="text-sm text-gray-500 mt-1">system status</p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2 justify-end">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full bg-orange-accent opacity-75" />
                  <span className="relative inline-flex h-2 w-2 bg-orange-accent" />
                </span>
                <span className="text-xs text-gray-500 uppercase tracking-wider">
                  live
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {loadError && (
          <div className="border-l-4 border-red-600 bg-red-50 p-4 mb-8">
            <div className="font-medium text-red-900 text-sm">
              error loading status data
            </div>
            <div className="text-sm text-red-700 mt-1">{loadError}</div>
          </div>
        )}

        <StatusContent
          initialData={initialData}
          historyData={historyData}
          initialClusterStatus={clusterStatus}
        />

        <footer className="mt-16 pt-8 border-t border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-xs text-gray-500">
            <p>
              monitoring checks run every minute. historical data retained for
              30 days.
            </p>
            <a
              href="https://uvacompute.com"
              className="text-orange-accent hover:underline"
            >
              uvacompute.com
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}
