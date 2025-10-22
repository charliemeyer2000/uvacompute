import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        data-slot="input"
        className={cn(
          "h-9 w-full min-w-0 border border-gray-300 bg-transparent px-3 py-1 text-base font-mono shadow-xs outline-none transition-[color,box-shadow]",
          "placeholder:text-gray-500",
          "focus:border-black",
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:font-mono",
          "selection:bg-black selection:text-white",
          "aria-invalid:border-red-600",
          "md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
