"use client";

import { useEffect, useState } from "react";
import type { StatusData, DayAggregate } from "@/types";
import { getStatus } from "../actions/status-actions";
import { StatusBadge } from "./status-badge";
import { ServiceStatus } from "./service-status";

interface StatusContentProps {
  initialData: StatusData;
  historyData?: DayAggregate[];
}

export function StatusContent({
  initialData,
  historyData = [],
}: StatusContentProps) {
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
      <div className="border-b border-gray-200 pb-6 mb-8">
        <h1 className="text-4xl font-semibold mb-2">uvacompute status</h1>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span>Live updates</span>
          <span>•</span>
          <span>Last updated {lastUpdate.toLocaleTimeString()}</span>
        </div>
        {fetchError && (
          <div className="mt-2 text-sm text-red-600">
            Update failed: {fetchError}
          </div>
        )}
      </div>

      <StatusBadge status={statusData.current.status} />

      <ServiceStatus
        name="VM Orchestration Service"
        status={statusData.current.status}
        responseTime={statusData.current.responseTime}
        historyData={historyData}
      />
    </>
  );
}
