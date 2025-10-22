"use client";

import { useEffect, useState } from "react";
import type { StatusData } from "@/types";
import { getStatus } from "../actions/status-actions";
import { StatusBadge } from "./status-badge";
import { ServiceStatus } from "./service-status";

interface StatusContentProps {
  initialData: StatusData;
}

export function StatusContent({ initialData }: StatusContentProps) {
  const [statusData, setStatusData] = useState<StatusData>(initialData);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [fetchError, setFetchError] = useState<string | null>(null);

  async function fetchStatus() {
    try {
      const data = await getStatus();
      setStatusData(data);
      setLastUpdate(new Date());
      setFetchError(null);
    } catch (error) {
      console.error("Failed to fetch status:", error);
      setFetchError(
        error instanceof Error ? error.message : "failed to fetch status",
      );
    }
  }

  useEffect(() => {
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <div className="border-b border-black pb-4 mb-6">
        <h1 className="text-3xl font-medium mb-2">uvacompute status</h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span>live updates</span>
          <span>•</span>
          <span>last updated {lastUpdate.toLocaleTimeString()}</span>
        </div>
        {fetchError && (
          <div className="mt-2 text-sm text-red-600">
            update failed: {fetchError}
          </div>
        )}
      </div>

      <StatusBadge status={statusData.current.status} />

      <div className="space-y-2">
        <div className="text-lg font-medium mb-3">services</div>
        <ServiceStatus
          name="vm orchestration service"
          status={statusData.current.status}
          responseTime={statusData.current.responseTime}
        />
      </div>
    </>
  );
}
