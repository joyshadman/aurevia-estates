"use client";

import { Heart } from "lucide-react";
import { cn } from "@/lib/cn";

// Presentational only; saving is wired by feature 14. A fixed label with
// `aria-pressed` avoids announcing the state twice (spec 0003).
export function FavoriteButton({
  pressed,
  pending = false,
  onToggle,
  className,
}: {
  pressed: boolean;
  pending?: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label="Save home"
      aria-pressed={pressed}
      aria-busy={pending || undefined}
      disabled={pending}
      onClick={onToggle}
      className={cn(
        "grid h-9 w-9 place-items-center rounded-full bg-surface-raised/95 text-accent shadow-soft transition-transform duration-fast hover:scale-105 disabled:opacity-60",
        className,
      )}
    >
      <Heart aria-hidden="true" strokeWidth={1.6} className={cn("h-[18px] w-[18px]", pressed && "fill-current")} />
    </button>
  );
}
