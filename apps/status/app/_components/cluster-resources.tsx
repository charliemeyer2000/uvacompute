import type { ClusterResources as ClusterResourcesType } from "@/types";
import { GPUBreakdown } from "./gpu-breakdown";

interface ClusterResourcesProps {
  resources: ClusterResourcesType;
}

function ResourceStat({
  label,
  available,
  total,
  unit,
}: {
  label: string;
  available: number;
  total: number;
  unit?: string;
}) {
  return (
    <div className="flex items-baseline justify-between py-3 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <div className="text-right">
        <span className="text-lg font-semibold text-black tabular-nums">
          {available}
        </span>
        <span className="text-sm text-gray-400">
          {" "}
          / {total}
          {unit && ` ${unit}`}
        </span>
      </div>
    </div>
  );
}

export function ClusterResources({ resources }: ClusterResourcesProps) {
  const { vcpus, ram, gpus } = resources;

  return (
    <div className="border border-gray-200 p-5 sm:p-6">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          available resources
        </h2>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      <div>
        <ResourceStat
          label="vcpus"
          available={vcpus.available}
          total={vcpus.total}
        />
        <ResourceStat
          label="memory"
          available={ram.available}
          total={ram.total}
          unit="gb"
        />
        <ResourceStat
          label="gpus"
          available={gpus.available}
          total={gpus.total}
        />
      </div>

      {gpus.total > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <GPUBreakdown byType={gpus.byType} />
        </div>
      )}
    </div>
  );
}
