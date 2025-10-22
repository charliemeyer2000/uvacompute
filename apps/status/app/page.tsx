"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "./components/status-badge";
import { ServiceStatus } from "./components/service-status";
import { UptimeChart } from "./components/uptime-chart";
import { IncidentHistory } from "./components/incident-history";
import { ServiceStatus as ServiceStatusType } from "@/lib/redis";

interface StatusData {
  current: {
    status: ServiceStatusType;
    responseTime: number;
    timestamp: number;
  };
  uptime: number;
}

export default function StatusPage() {
  const [statusData, setStatusData] = useState<StatusData | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);

  async function fetchStatus() {
    try {
      const response = await fetch("/api/status");
      const data = await response.json();
      setStatusData(data);
      setLastUpdate(new Date());
    } catch (error) {
      console.error("Failed to fetch status:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-white p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-20">
            <div className="text-2xl font-medium mb-2">uvacompute status</div>
            <div className="text-muted-foreground">loading...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="border-b border-black pb-4 mb-6">
          <h1 className="text-3xl font-medium mb-2">uvacompute status</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span>live updates</span>
            <span>•</span>
            <span>last updated {lastUpdate.toLocaleTimeString()}</span>
          </div>
        </div>

        {statusData && (
          <>
            <StatusBadge status={statusData.current.status} />

            <div className="space-y-2">
              <div className="text-lg font-medium mb-3">services</div>
              <ServiceStatus
                name="vm orchestration service"
                status={statusData.current.status}
                responseTime={statusData.current.responseTime}
              />
            </div>

            <UptimeChart days={90} />

            <IncidentHistory />
          </>
        )}

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
