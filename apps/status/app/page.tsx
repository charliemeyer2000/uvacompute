import { Suspense } from "react";
import { StatusContent } from "./_components/status-content";
import { UptimeChartWrapper } from "./_components/uptime-chart-wrapper";
import { getStatus } from "./actions/status-actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function StatusPage() {
  const initialData = await getStatus();

  return (
    <div className="min-h-screen bg-white p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <StatusContent initialData={initialData} />

        <Suspense fallback={<ChartSkeleton />}>
          <UptimeChartWrapper days={90} />
        </Suspense>

        <div className="border-t border-black pt-6 mt-8">
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
