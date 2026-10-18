import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const roleColors = [
  "surface",
  "surface-raised",
  "surface-sunken",
  "fg",
  "fg-muted",
  "fg-subtle",
  "line",
  "line-strong",
  "accent",
  "accent-hover",
  "on-accent",
  "accent-subtle",
  "accent-subtle-fg",
  "secondary",
  "focus",
  "success",
  "success-subtle",
  "success-subtle-fg",
  "warning",
  "warning-subtle",
  "warning-subtle-fg",
  "danger",
  "danger-hover",
  "danger-subtle",
  "danger-subtle-fg",
  "overlay",
];

// Taught our custom theme keys, so a caller's `shadow-lift` replaces `shadow-soft`
// instead of both staying in the class list (spec 0003).
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: roleColors,
      shadow: ["soft", "lift"],
      font: ["display", "sans", "bangla"],
    },
    classGroups: {
      duration: [{ duration: ["fast", "base"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
