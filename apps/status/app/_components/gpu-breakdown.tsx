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
    return <span className="text-gray-400 text-xs font-mono">no gpus</span>;
  }

  return (
    <div className="flex flex-wrap gap-2 text-xs font-mono">
      {entries.map(([type, counts]) => (
        <span key={type} className="text-gray-600">
          {counts.total}× {formatGPUType(type)}
        </span>
      ))}
    </div>
  );
}
