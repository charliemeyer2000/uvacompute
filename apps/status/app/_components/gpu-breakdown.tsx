interface GPUBreakdownProps {
  byType: Record<string, { total: number; available: number }>;
}

function formatGPUType(type: string): string {
  if (type === "none" || type === "unknown") return type;
  return type
    .replace(/^nvidia-/, "")
    .replace(/-/g, " ")
    .toUpperCase();
}

export function GPUBreakdown({ byType }: GPUBreakdownProps) {
  const entries = Object.entries(byType).filter(
    ([type]) => type !== "none" && type !== "unknown",
  );

  if (entries.length === 0) {
    return <span className="text-gray-400 text-xs">no gpus</span>;
  }

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {entries.map(([type, counts]) => (
        <span key={type} className="text-gray-600">
          <span className="font-medium text-black">{counts.total}×</span>{" "}
          {formatGPUType(type)}
          <span className="text-gray-400 ml-1">({counts.available} free)</span>
        </span>
      ))}
    </div>
  );
}
