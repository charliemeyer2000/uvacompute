import type { ClusterResources as ClusterResourcesType } from "@/types";
import { GPUBreakdown } from "./gpu-breakdown";

interface ClusterResourcesProps {
  resources: ClusterResourcesType;
}

export function ClusterResources({ resources }: ClusterResourcesProps) {
  const { vcpus, ram, gpus } = resources;

  return (
    <div className="border border-gray-200 p-4 sm:p-6 mb-6 sm:mb-8">
      <h2 className="text-sm font-medium text-gray-900 mb-4">
        cluster resources
      </h2>

      <div className="grid grid-cols-3 gap-4 sm:gap-8">
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
            vcpus
          </div>
          <div className="font-mono">
            <span className="text-lg sm:text-2xl font-semibold text-gray-900">
              {vcpus.total}
            </span>
            <span className="text-xs sm:text-sm text-gray-500 ml-1">total</span>
          </div>
          <div className="text-xs text-gray-500 font-mono mt-1">
            {vcpus.available} available
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
            ram
          </div>
          <div className="font-mono">
            <span className="text-lg sm:text-2xl font-semibold text-gray-900">
              {ram.total}
            </span>
            <span className="text-xs sm:text-sm text-gray-500 ml-1">gb</span>
          </div>
          <div className="text-xs text-gray-500 font-mono mt-1">
            {ram.available} gb available
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
            gpus
          </div>
          <div className="font-mono">
            <span className="text-lg sm:text-2xl font-semibold text-gray-900">
              {gpus.total}
            </span>
            <span className="text-xs sm:text-sm text-gray-500 ml-1">total</span>
          </div>
          <div className="text-xs text-gray-500 font-mono mt-1">
            {gpus.available} available
          </div>
        </div>
      </div>

      {gpus.total > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="text-xs text-gray-500 mb-2">gpu breakdown</div>
          <GPUBreakdown byType={gpus.byType} />
        </div>
      )}
    </div>
  );
}
