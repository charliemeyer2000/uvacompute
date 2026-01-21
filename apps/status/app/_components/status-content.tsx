"use client";

import { useEffect, useState } from "react";
import type { StatusData, DayAggregate, ClusterStatus } from "@/types";
import { getStatus, getClusterStatus } from "../actions/status-actions";
import { StatusBadge } from "./status-badge";
import { ServiceStatus } from "./service-status";
import { StatusIndicator } from "./status-indicator";
import { ClusterResources } from "./cluster-resources";
import { NodeList } from "./node-list";

interface StatusContentProps {
  initialData: StatusData;
  historyData?: DayAggregate[];
  initialClusterStatus?: ClusterStatus | null;
}

export function StatusContent({
  initialData,
  historyData = [],
  initialClusterStatus = null,
}: StatusContentProps) {
  const [statusData, setStatusData] = useState<StatusData>(initialData);
  const [clusterStatus, setClusterStatus] = useState<ClusterStatus | null>(
    initialClusterStatus,
  );
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [fetchError, setFetchError] = useState<string | null>(null);

  async function fetchAllStatus() {
    try {
      const [serviceData, cluster] = await Promise.all([
        getStatus(),
        getClusterStatus(),
      ]);
      setStatusData(serviceData);
      setClusterStatus(cluster);
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
    const interval = setInterval(fetchAllStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  const overallStatus = clusterStatus?.overall || statusData.current.status;

  return (
    <>
      <div className="border-b border-gray-200 pb-4 sm:pb-6 mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-4xl font-semibold mb-2">
          uvacompute status
        </h1>
        <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600 flex-wrap">
          <StatusIndicator size="sm" />
          <span>Live updates</span>
          <span>•</span>
          <span>Last updated {lastUpdate.toLocaleTimeString()}</span>
        </div>
        {fetchError && (
          <div className="mt-2 text-xs sm:text-sm text-red-600">
            Update failed: {fetchError}
          </div>
        )}
      </div>

      <StatusBadge status={overallStatus} />

      {clusterStatus && (
        <>
          <ClusterResources resources={clusterStatus.resources} />
          <NodeList
            nodes={clusterStatus.nodes}
            nodeCounts={clusterStatus.resources.nodes}
          />
        </>
      )}

      <div className="border border-gray-200 p-4 sm:p-6">
        <h2 className="text-sm font-medium text-gray-900 mb-4">services</h2>
        <ServiceStatus
          name="VM Orchestration Service"
          status={statusData.current.status}
          responseTime={statusData.current.responseTime}
          historyData={historyData}
        />
      </div>
    </>
  );
}
