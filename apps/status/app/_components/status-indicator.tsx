import { cn } from "@/lib/utils";

interface StatusIndicatorProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function StatusIndicator({
  className,
  size = "md",
}: StatusIndicatorProps) {
  const sizeClasses = {
    sm: "w-2 h-2",
    md: "w-3 h-3",
    lg: "w-4 h-4",
  };

  return (
    <div className={cn("relative inline-flex", className)}>
      <span
        className={cn(
          "absolute inline-flex rounded-full bg-green-400 opacity-75 animate-ping",
          sizeClasses[size],
        )}
      />
      <span
        className={cn(
          "relative inline-flex rounded-full bg-green-500",
          sizeClasses[size],
        )}
      />
    </div>
  );
}
