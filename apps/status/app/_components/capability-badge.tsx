interface CapabilityBadgeProps {
  supportsVMs: boolean;
  supportsJobs: boolean;
}

export function CapabilityBadge({
  supportsVMs,
  supportsJobs,
}: CapabilityBadgeProps) {
  const capabilities: string[] = [];
  if (supportsVMs) capabilities.push("vms");
  if (supportsJobs) capabilities.push("jobs");

  if (capabilities.length === 0) {
    return <span className="text-xs text-gray-400">—</span>;
  }

  return (
    <div className="flex gap-1.5">
      {capabilities.map((cap) => (
        <span
          key={cap}
          className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600"
        >
          {cap}
        </span>
      ))}
    </div>
  );
}
