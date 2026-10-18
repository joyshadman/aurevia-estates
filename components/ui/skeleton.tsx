import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

// The pulse turns off under reduced motion (global rule in globals.css).
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-xl bg-surface-sunken", className)} {...props} />;
}
