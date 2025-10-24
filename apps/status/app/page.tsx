import { Suspense } from "react";
import { StatusContent } from "./_components/status-content";
import { UptimeChartWrapper } from "./_components/uptime-chart-wrapper";
import { getStatus } from "./actions/status-actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function StatusPage() {
  let initialData;
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

  return (
    <div className="min-h-screen bg-white p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {loadError && (
          <div className="border border-red-600 bg-red-50 p-4 mb-6">
            <div className="font-medium text-red-900 mb-1">
              failed to load status data
            </div>
            <div className="text-sm text-red-700">{loadError}</div>
          </div>
        )}

        <StatusContent initialData={initialData} />

        <Suspense fallback={<ChartSkeleton />}>
          <UptimeChartWrapper days={90} />
        </Suspense>

        <div className="pt-6 mt-8">
          <div className="text-sm text-muted-foreground">
            <p className="mb-2">
              this page shows the real-time status of uvacompute services.
            </p>
            <p>
              monitoring checks run every minute. historical data is retained
              for 90 days.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="border border-black p-6">
      <div className="text-lg font-medium mb-4">uptime last 90 days</div>
      <div className="h-24 flex items-center justify-center text-muted-foreground">
        loading...
      </div>
    </div>
  );
}
