import { subDays } from "date-fns";
import { StatusContent } from "./_components/status-content";
import {
  getAllStatuses,
  getAllHistories,
  getClusterStatus,
} from "./actions/status-actions";
import { SERVICE_IDS } from "@/types";
import type {
  DayAggregate,
  ClusterStatus,
  ServiceId,
  StatusData,
} from "@/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function StatusPage() {
  let initialStatuses: Record<ServiceId, StatusData> | null = null;
  let historyDataMap: Record<ServiceId, DayAggregate[]> = {} as Record<
    ServiceId,
    DayAggregate[]
  >;
  let clusterStatus: ClusterStatus | null = null;
  let loadError = null;

  try {
    initialStatuses = await getAllStatuses();
  } catch (error) {
    console.error("Failed to load initial status:", error);
    loadError =
      error instanceof Error ? error.message : "failed to load status data";
  }

  // Build fallback if status fetch failed
  if (!initialStatuses) {
    const fallback: StatusData = {
      current: {
        status: "down" as const,
        responseTime: 0,
        timestamp: Date.now(),
        error: loadError || "failed to load status data",
      },
      history: [],
      uptime: 0,
    };
    initialStatuses = Object.fromEntries(
      SERVICE_IDS.map((id) => [id, fallback]),
    ) as Record<ServiceId, StatusData>;
  }

  try {
    clusterStatus = await getClusterStatus();
  } catch (error) {
    console.error("Failed to load cluster status:", error);
  }

  try {
    const days = 30;
    const allHistories = await getAllHistories(days);
    const today = new Date();

    for (const serviceId of SERVICE_IDS) {
      const result = allHistories[serviceId];
      const dataMap = new Map<string, DayAggregate>(
        result.aggregated.map((d) => [d.date, d]),
      );

      const filled: DayAggregate[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const date = subDays(today, i).toISOString().split("T")[0];
        const dayData = dataMap.get(date);

        if (dayData) {
          filled.push(dayData);
        } else {
          filled.push({
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
      historyDataMap[serviceId] = filled;
    }
  } catch (error) {
    console.error("Failed to load history data:", error);
    // Ensure all services have empty arrays
    for (const serviceId of SERVICE_IDS) {
      if (!historyDataMap[serviceId]) {
        historyDataMap[serviceId] = [];
      }
    }
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
          initialStatuses={initialStatuses}
          historyDataMap={historyDataMap}
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
