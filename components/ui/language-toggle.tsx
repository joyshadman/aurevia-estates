"use client";

import { cn } from "@/lib/cn";

export type ChatLocale = "en" | "bn";

// Two button pressed group for the chat (feature 7). Not placed in the header
// while Bangla across the site is deferred (spec 0003).
export function LanguageToggle({
  value,
  onChange,
  className,
}: {
  value: ChatLocale;
  onChange: (value: ChatLocale) => void;
  className?: string;
}) {
  const option = (locale: ChatLocale, label: string, lang: string) => (
    <button
      type="button"
      lang={lang}
      aria-pressed={value === locale}
      onClick={() => onChange(locale)}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-fast",
        value === locale ? "bg-accent text-on-accent" : "text-fg-muted hover:text-fg",
      )}
    >
      {label}
    </button>
  );

  return (
    <div role="group" aria-label="Reply language" className={cn("inline-flex rounded-full border border-line bg-surface-raised p-1", className)}>
      {option("en", "English", "en")}
      {option("bn", "বাংলা", "bn")}
    </div>
  );
}
