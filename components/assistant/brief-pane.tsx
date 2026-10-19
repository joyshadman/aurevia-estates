"use client";

import { X } from "lucide-react";
import type { ChatLocale } from "@/lib/domain/chat-text";
import type { BriefItem } from "@/lib/server/conversations";

const groupLabels: Record<BriefItem["field"], string> = {
  budget: "Budget",
  areaIds: "Areas",
  propertyTypes: "Home type",
  minBedrooms: "Bedrooms",
  minBathrooms: "Bathrooms",
  familySize: "Household",
  amenityIds: "Must haves",
  notes: "Notes",
};

// "Your brief" (spec 0006, AC-3, AC-12): what the assistant recorded, each item
// removable. Removal waits while a reply streams.
export function BriefPane({
  items,
  locale,
  disabled,
  onRemove,
}: {
  items: BriefItem[];
  locale: ChatLocale;
  disabled: boolean;
  onRemove: (item: BriefItem) => void;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-fg-muted">Your brief fills in as you chat: budget, areas, rooms, and must haves.</p>;
  }
  const groups = Object.keys(groupLabels) as BriefItem["field"][];
  return (
    <dl className="flex flex-col gap-4">
      {groups.map((field) => {
        const entries = items.filter((item) => item.field === field);
        if (entries.length === 0) return null;
        return (
          <div key={field}>
            <dt className="text-xs font-medium tracking-wide text-fg-subtle uppercase">{groupLabels[field]}</dt>
            <dd className="mt-1.5 flex flex-wrap gap-2">
              {entries.map((item) => {
                const label = locale === "bn" ? item.labelBn : item.label;
                return (
                  <span
                    key={`${item.field}:${item.value ?? ""}`}
                    lang={locale === "bn" ? "bn" : undefined}
                    className="inline-flex items-center gap-1 rounded-full bg-surface-sunken py-1 pr-1 pl-3 text-sm text-fg"
                  >
                    {label}
                    <button
                      type="button"
                      onClick={() => onRemove(item)}
                      disabled={disabled}
                      aria-label={`Remove ${item.label} from your brief`}
                      className="grid h-6 w-6 place-items-center rounded-full text-fg-muted hover:bg-surface-raised hover:text-fg disabled:opacity-50"
                    >
                      <X aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>
                  </span>
                );
              })}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
