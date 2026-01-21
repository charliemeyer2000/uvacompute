"use client";

import { useEffect, useState } from "react";
import type { StatusData, DayAggregate, ClusterStatus } from "@/types";
import { getStatus, getClusterStatus } from "../actions/status-actions";
import { StatusBadge } from "./status-badge";
import { ServiceStatus } from "./service-status";
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
    <div className="space-y-8">
      <section>
        <StatusBadge status={overallStatus} lastUpdate={lastUpdate} />
        {fetchError && (
          <p className="text-xs text-red-600 mt-2">
            update failed: {fetchError}
          </p>
        )}
      </section>

      {clusterStatus && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ClusterResources resources={clusterStatus.resources} />
          <NodeList
            nodes={clusterStatus.nodes}
            nodeCounts={clusterStatus.resources.nodes}
          />
        </section>
      )}

      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            services
          </h2>
          <div className="flex-1 h-px bg-gray-200" />
        </div>
        <ServiceStatus
          name="vm orchestration"
          status={statusData.current.status}
          responseTime={statusData.current.responseTime}
          historyData={historyData}
        />
      </section>
    </div>
  );
}
