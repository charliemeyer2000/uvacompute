"use client";

import { useEffect, useState } from "react";
import { SERVICE_IDS, SERVICE_NAMES } from "@/types";
import type {
  StatusData,
  DayAggregate,
  ClusterStatus,
  ServiceId,
  ServiceStatus as ServiceStatusType,
} from "@/types";
import { getAllStatuses, getClusterStatus } from "../actions/status-actions";
import { StatusBadge } from "./status-badge";
import { ServiceStatus } from "./service-status";
import { ClusterResources } from "./cluster-resources";
import { NodeList } from "./node-list";

interface StatusContentProps {
  initialStatuses: Record<ServiceId, StatusData>;
  historyDataMap: Record<ServiceId, DayAggregate[]>;
  initialClusterStatus?: ClusterStatus | null;
}

function deriveOverallStatus(
  statuses: Record<ServiceId, StatusData>,
  clusterStatus: ClusterStatus | null,
): ServiceStatusType {
  const all: ServiceStatusType[] = SERVICE_IDS.map(
    (id) => statuses[id].current.status,
  );
  if (clusterStatus) all.push(clusterStatus.overall);

  if (all.includes("down")) return "down";
  if (all.includes("degraded")) return "degraded";
  return "operational";
}

export function StatusContent({
  initialStatuses,
  historyDataMap,
  initialClusterStatus = null,
}: StatusContentProps) {
  const [statuses, setStatuses] =
    useState<Record<ServiceId, StatusData>>(initialStatuses);
  const [clusterStatus, setClusterStatus] = useState<ClusterStatus | null>(
    initialClusterStatus,
  );
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [fetchError, setFetchError] = useState<string | null>(null);

  async function fetchAllStatus() {
    try {
      const [serviceData, cluster] = await Promise.all([
        getAllStatuses(),
        getClusterStatus(),
      ]);
      setStatuses(serviceData);
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

  const overallStatus = deriveOverallStatus(statuses, clusterStatus);

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
        <div className="space-y-4">
          {SERVICE_IDS.map((serviceId) => (
            <ServiceStatus
              key={serviceId}
              name={SERVICE_NAMES[serviceId]}
              status={statuses[serviceId].current.status}
              responseTime={statuses[serviceId].current.responseTime}
              historyData={historyDataMap[serviceId]}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
