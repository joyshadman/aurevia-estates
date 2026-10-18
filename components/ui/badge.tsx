import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium", {
  variants: {
    tone: {
      neutral: "bg-surface-sunken text-fg-muted",
      accent: "bg-accent-subtle text-accent-subtle-fg",
      success: "bg-success-subtle text-success-subtle-fg",
      warning: "bg-warning-subtle text-warning-subtle-fg",
      danger: "bg-danger-subtle text-danger-subtle-fg",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ tone, className, ...props }: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
