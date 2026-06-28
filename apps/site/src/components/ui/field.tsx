import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const fieldVariants = cva("flex flex-col gap-2", {
  variants: {
    orientation: {
      vertical: "flex flex-col",
      horizontal: "flex flex-row items-center justify-between gap-4",
      responsive:
        "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4",
    },
  },
  defaultVariants: {
    orientation: "vertical",
  },
});

function Field({
  className,
  orientation,
  ref,
  ...props
}: React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof fieldVariants> & {
    ref?: React.Ref<HTMLDivElement>;
  }) {
  return (
    <div
      ref={ref}
      className={cn(fieldVariants({ orientation }), className)}
      {...props}
    />
  );
}

function FieldLabel({
  className,
  ref,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & {
  ref?: React.Ref<HTMLLabelElement>;
}) {
  return (
    <label
      ref={ref}
      className={cn("text-sm font-medium font-mono", className)}
      {...props}
    />
  );
}

function FieldDescription({
  className,
  ref,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement> & {
  ref?: React.Ref<HTMLParagraphElement>;
}) {
  return (
    <p
      ref={ref}
      className={cn("text-sm text-gray-500 font-mono", className)}
      {...props}
    />
  );
}

function FieldError({
  className,
  errors,
  ref,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement> & {
  errors?: string[];
  ref?: React.Ref<HTMLParagraphElement>;
}) {
  if (!errors || errors.length === 0) return null;

  return (
    <p
      ref={ref}
      className={cn("text-sm text-red-600 font-mono", className)}
      {...props}
    >
      {errors.join(", ")}
    </p>
  );
}

function FieldGroup({
  className,
  ref,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  ref?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      className={cn("flex flex-col gap-4", className)}
      {...props}
    />
  );
}

function FieldSet({
  className,
  ref,
  ...props
}: React.FieldsetHTMLAttributes<HTMLFieldSetElement> & {
  ref?: React.Ref<HTMLFieldSetElement>;
}) {
  return (
    <fieldset
      ref={ref}
      className={cn("flex flex-col gap-4", className)}
      {...props}
    />
  );
}

function FieldLegend({
  className,
  variant = "default",
  ref,
  ...props
}: React.HTMLAttributes<HTMLLegendElement> & {
  variant?: "label" | "default";
  ref?: React.Ref<HTMLLegendElement>;
}) {
  return (
    <legend
      ref={ref}
      className={cn(
        "font-mono",
        variant === "label" && "text-sm font-medium",
        variant === "default" && "text-base font-semibold",
        className,
      )}
      {...props}
    />
  );
}

function FieldContent({
  className,
  ref,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  ref?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      className={cn("flex flex-col gap-1", className)}
      {...props}
    />
  );
}

export {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldSet,
  FieldLegend,
  FieldContent,
};
