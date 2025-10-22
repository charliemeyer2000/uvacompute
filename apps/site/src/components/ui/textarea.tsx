import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "w-full min-w-0 min-h-16 border border-gray-300 bg-transparent px-3 py-2 text-base font-mono shadow-xs outline-none transition-[color,box-shadow]",
        "placeholder:text-gray-500",
        "focus:border-black",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "selection:bg-black selection:text-white",
        "aria-invalid:border-red-600",
        "md:text-sm",
        "resize-y",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
