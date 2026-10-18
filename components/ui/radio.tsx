import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type RadioProps = Omit<ComponentProps<"input">, "type"> & { label: ReactNode };

export function Radio({ label, className, id, ...props }: RadioProps) {
  return (
    <label htmlFor={id} className={cn("inline-flex min-h-6 items-center gap-3 text-sm text-fg", className)}>
      <input
        id={id}
        type="radio"
        className="h-5 w-5 shrink-0 cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-60"
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}
