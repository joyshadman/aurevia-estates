import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

// Inputs sit on `surface-raised` only: the strong border fails 3:1 on sunken
// surfaces in light mode (spec 0003).
export const fieldControlClass =
  "w-full rounded-xl border border-line-strong bg-surface-raised px-4 text-sm text-fg placeholder:text-fg-subtle transition-colors duration-fast hover:border-fg-subtle disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldControlClass, "h-11", className)} {...props} />;
}

export function Textarea({ className, rows = 4, ...props }: ComponentProps<"textarea">) {
  return <textarea rows={rows} className={cn(fieldControlClass, "py-3 leading-relaxed", className)} {...props} />;
}
