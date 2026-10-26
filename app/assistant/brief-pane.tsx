"use client";

import { ClipboardList, X } from "lucide-react";
import { budgetLabel, propertyTypeLabel } from "@/lib/assistant/copy";
import type { ChatLocale } from "@/lib/domain/bangla";
import type { BriefView } from "@/lib/server/assistant/brief";
import type { BriefField } from "@/lib/server/assistant/chat-edits";

// "Your brief" (spec 0006, *Brief pane*, AC-3, AC-12): what the assistant
// stored, each item with a remove button. Area and amenity names follow the
// toggle's language; the rest of the pane is English.

export type BriefRemoval = { field: BriefField; value?: string };

// Which item a pending removal belongs to.
export const removalKey = (removal: BriefRemoval) => `${removal.field}:${removal.value ?? ""}`;

type Item = { key: string; label: string; lang?: "bn"; removal: BriefRemoval; removeName: string };

export function briefItemCount(brief: BriefView | null): number {
  if (!brief) return 0;
  return (
    (brief.budgetMinBdt !== null || brief.budgetMaxBdt !== null ? 1 : 0) +
    brief.areas.length +
    brief.propertyTypes.length +
    brief.amenities.length +
    [brief.minBedrooms, brief.minBathrooms, brief.familySize, brief.notes].filter((value) => value !== null).length
  );
}

export function BriefPane({
  brief,
  locale,
  disabled,
  pending,
  onRemove,
  inDialog = false,
}: {
  brief: BriefView | null;
  locale: ChatLocale;
  // A reply is streaming: removal waits (AC-12).
  disabled: boolean;
  pending: string | null;
  onRemove: (removal: BriefRemoval) => void;
  // Inside the mobile sheet, whose dialog title already says "Your brief".
  inDialog?: boolean;
}) {
  const bn = locale === "bn";
  const lang = bn ? ("bn" as const) : undefined;
  const budget = brief ? budgetLabel(brief.budgetMinBdt, brief.budgetMaxBdt) : null;

  type Row = { term: string; items: Item[] };
  const allRows: Row[] = brief
    ? [
        {
          term: "Budget",
          items: budget ? [{ key: "budget", label: budget, removal: { field: "budget" }, removeName: "the budget" }] : [],
        },
        {
          term: "Areas",
          items: brief.areas.map((area) => ({
            key: area.id,
            label: bn ? area.nameBn : area.nameEn,
            lang,
            removal: { field: "areas", value: area.id },
            removeName: area.nameEn,
          })),
        },
        {
          term: "Property type",
          items: brief.propertyTypes.map((type) => ({
            key: type,
            label: propertyTypeLabel(type, locale),
            lang,
            removal: { field: "propertyTypes", value: type },
            removeName: propertyTypeLabel(type, "en"),
          })),
        },
        {
          term: "Bedrooms",
          items:
            brief.minBedrooms !== null
              ? [{ key: "beds", label: `${brief.minBedrooms}+`, removal: { field: "minBedrooms" }, removeName: "bedrooms" }]
              : [],
        },
        {
          term: "Bathrooms",
          items:
            brief.minBathrooms !== null
              ? [{ key: "baths", label: `${brief.minBathrooms}+`, removal: { field: "minBathrooms" }, removeName: "bathrooms" }]
              : [],
        },
        {
          term: "Household",
          items:
            brief.familySize !== null
              ? [
                  {
                    key: "family",
                    label: brief.familySize === 1 ? "1 person" : `${brief.familySize} people`,
                    removal: { field: "familySize" },
                    removeName: "the household size",
                  },
                ]
              : [],
        },
      ]
    : [];
  const rows = allRows.filter((row) => row.items.length > 0);

  const amenities: Item[] =
    brief?.amenities.map((amenity) => ({
      key: amenity.id,
      label: bn ? (amenity.labelBn ?? amenity.label) : amenity.label,
      lang: bn && amenity.labelBn ? "bn" : undefined,
      removal: { field: "amenities", value: amenity.id },
      removeName: amenity.label,
    })) ?? [];
  const empty = briefItemCount(brief) === 0;

  return (
    <section aria-labelledby={inDialog ? undefined : "brief-heading"} aria-label={inDialog ? "Your brief" : undefined} className="flex flex-col">
      {inDialog ? null : (
        <>
          <h2 id="brief-heading" className="font-display text-xl text-fg">
            Your brief
          </h2>
          <p className="mt-1 text-xs text-fg-subtle">Built from this conversation</p>
        </>
      )}

      {empty ? (
        <div className="mt-5 flex flex-col items-start gap-3 rounded-xl bg-surface-sunken p-4">
          <ClipboardList aria-hidden="true" strokeWidth={1.5} className="h-5 w-5 text-fg-subtle" />
          <p className="text-sm text-fg-muted">
            Tell the assistant your budget, areas, and how many bedrooms you need. What it learns shows here, and you can remove
            anything that no longer fits.
          </p>
        </div>
      ) : (
        <>
          <dl className="mt-5 flex flex-col gap-3 text-sm">
            {rows.map((row) => (
              <div key={row.term} className="flex items-start justify-between gap-3 border-b border-line pb-3">
                <dt className="pt-1 text-fg-muted">{row.term}</dt>
                <dd className="flex flex-wrap justify-end gap-1.5">
                  {row.items.map((item) => (
                    <BriefChip key={item.key} item={item} disabled={disabled || pending !== null} pending={pending === removalKey(item.removal)} onRemove={onRemove} />
                  ))}
                </dd>
              </div>
            ))}
          </dl>

          {amenities.length > 0 ? (
            <>
              <h3 className="mt-5 text-xs font-medium tracking-[.18em] text-fg-subtle uppercase">Must haves</h3>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {amenities.map((item) => (
                  <li key={item.key}>
                    <BriefChip item={item} disabled={disabled || pending !== null} pending={pending === removalKey(item.removal)} onRemove={onRemove} />
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {brief?.notes ? (
            <>
              <h3 className="mt-5 text-xs font-medium tracking-[.18em] text-fg-subtle uppercase">Other needs</h3>
              <div className="mt-2 flex items-start justify-between gap-3 text-sm text-fg">
                <p lang={lang} className="min-w-0 break-words">
                  {brief.notes}
                </p>
                <RemoveButton
                  name="the other needs"
                  disabled={disabled || pending !== null}
                  onClick={() => onRemove({ field: "notes" })}
                />
              </div>
            </>
          ) : null}

          <p className="mt-5 text-xs text-fg-subtle">
            {disabled ? "You can edit your brief once the reply finishes." : "Remove an item and the assistant uses the change on your next message."}
          </p>
        </>
      )}
    </section>
  );
}

function BriefChip({
  item,
  disabled,
  pending,
  onRemove,
}: {
  item: Item;
  disabled: boolean;
  pending: boolean;
  onRemove: (removal: BriefRemoval) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent-subtle py-1 pr-1 pl-3 text-xs font-medium text-accent-subtle-fg">
      <span lang={item.lang}>{item.label}</span>
      <RemoveButton name={item.removeName} disabled={disabled} pending={pending} onClick={() => onRemove(item.removal)} />
    </span>
  );
}

function RemoveButton({
  name,
  disabled,
  pending = false,
  onClick,
}: {
  name: string;
  disabled: boolean;
  pending?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Remove ${name} from your brief`}
      aria-busy={pending || undefined}
      disabled={disabled}
      onClick={onClick}
      className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-current transition-colors duration-fast hover:bg-surface-raised disabled:opacity-50"
    >
      <X aria-hidden="true" strokeWidth={1.5} className="h-3.5 w-3.5" />
    </button>
  );
}
