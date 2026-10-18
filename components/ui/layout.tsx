import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Container({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)} {...props} />;
}

const sectionVariants = cva("py-16 sm:py-20", {
  variants: {
    tone: {
      default: "",
      raised: "bg-surface-raised",
      accent: "bg-accent-subtle",
    },
  },
  defaultVariants: { tone: "default" },
});

export function Section({ tone, className, ...props }: ComponentProps<"section"> & VariantProps<typeof sectionVariants>) {
  return <section className={cn(sectionVariants({ tone }), className)} {...props} />;
}

export function Eyebrow({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-xs tracking-[.18em] text-fg-subtle uppercase", className)} {...props} />;
}
