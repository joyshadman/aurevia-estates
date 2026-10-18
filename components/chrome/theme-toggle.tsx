"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { Menu, MenuItemRadio } from "@/components/ui/menu";
import { cn } from "@/lib/cn";
import { setPreference, useThemePreference } from "@/lib/theme-client";
import type { ThemePreference } from "@/lib/theme";

const options: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

// Light, dark, or system (spec 0003). The trigger icon is chosen by CSS from
// `data-theme-pref`, so server and client markup are identical.
export function ThemeToggle({
  onChange,
  className,
}: {
  // Account sync hook: the signed in header passes a saver (spec 0003 AC-5).
  onChange?: (value: ThemePreference) => void;
  className?: string;
}) {
  const current = useThemePreference();

  return (
    <Menu
      label="Theme"
      triggerClassName={cn(
        "grid h-10 w-10 place-items-center rounded-full border border-line text-fg-muted transition-colors duration-fast hover:text-fg",
        className,
      )}
      trigger={
        <>
          <Sun data-theme-icon="light" aria-hidden="true" strokeWidth={1.5} className="h-5 w-5" />
          <Moon data-theme-icon="dark" aria-hidden="true" strokeWidth={1.5} className="h-5 w-5" />
          <Monitor data-theme-icon="system" aria-hidden="true" strokeWidth={1.5} className="h-5 w-5" />
        </>
      }
    >
      {options.map((option) => (
        <MenuItemRadio
          key={option.value}
          checked={current === option.value}
          onSelect={() => {
            setPreference(option.value);
            onChange?.(option.value);
          }}
        >
          {option.label}
        </MenuItemRadio>
      ))}
    </Menu>
  );
}
