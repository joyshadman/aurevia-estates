"use client";

import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const boxClass =
  "h-5 w-5 shrink-0 cursor-pointer rounded border border-line-strong bg-surface-raised accent-accent disabled:cursor-not-allowed disabled:opacity-60";

type CheckboxProps = Omit<ComponentProps<"input">, "type"> & {
  label: ReactNode;
  indeterminate?: boolean;
};

// Native checkbox; `indeterminate` exists only as a DOM property, set through a ref.
export function Checkbox({ label, indeterminate = false, className, id, ...props }: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <label htmlFor={id} className={cn("inline-flex min-h-6 items-center gap-3 text-sm text-fg", className)}>
      <input ref={ref} id={id} type="checkbox" className={boxClass} {...props} />
      <span>{label}</span>
    </label>
  );
}
