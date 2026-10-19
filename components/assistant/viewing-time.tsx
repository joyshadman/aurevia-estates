"use client";

import { useSyncExternalStore } from "react";
import { formatViewingTime, type Slot } from "@/lib/domain/viewing-slots";
import { cn } from "@/lib/cn";

// Viewing times in Sylhet and, when the browser is elsewhere, in local time too
// (spec 0007, AC-3). The zone is read after hydration, so the server render
// shows Sylhet only and never mismatches.

const noop = () => () => {};
export function useBrowserZone(): string | null {
  return useSyncExternalStore(
    noop,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null,
  );
}

function sameClock(start: string, zone: string) {
  const at = (timeZone: string) =>
    new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", day: "2-digit" }).format(new Date(start));
  return at(zone) === at("Asia/Dhaka");
}

function cityOf(zone: string) {
  return zone.split("/").at(-1)?.replace(/_/g, " ") ?? zone;
}

export function ViewingTime({ start, className }: { start: string; className?: string }) {
  const zone = useBrowserZone();
  const local = zone && !sameClock(start, zone) ? `${formatViewingTime(start, zone).split(", ")[1]} ${cityOf(zone)}` : null;
  return (
    <span className={className}>
      {formatViewingTime(start)} Sylhet{local ? <span className="text-fg-muted"> · {local}</span> : null}
    </span>
  );
}

// Slots grouped by day as one radio group (keyboard: arrows move within it).
export function SlotPicker({
  slots,
  value,
  onChange,
  name,
  disabled,
}: {
  slots: Slot[];
  value: string | null;
  onChange: (start: string) => void;
  name: string;
  disabled?: boolean;
}) {
  const zone = useBrowserZone();
  const days = new Map<string, Slot[]>();
  for (const slot of slots) days.set(slot.date, [...(days.get(slot.date) ?? []), slot]);
  const dayLabel = (date: string) =>
    new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));

  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled}>
      <legend className="mb-2 text-sm font-medium text-fg">Pick a time (Sylhet)</legend>
      <div className="flex max-h-64 flex-col gap-3 overflow-y-auto pr-1">
        {[...days.entries()].map(([date, daySlots]) => (
          <div key={date} className="flex flex-wrap items-center gap-2">
            <span className="w-24 shrink-0 text-xs text-fg-subtle">{dayLabel(date)}</span>
            {daySlots.map((slot) => {
              const id = `${name}-${slot.start}`;
              const local =
                zone && !sameClock(slot.start, zone) ? `${formatViewingTime(slot.start, zone).split(", ")[1]} ${cityOf(zone)}` : null;
              const time = formatViewingTime(slot.start).split(", ")[1];
              return (
                <label
                  key={slot.start}
                  htmlFor={id}
                  className={cn(
                    "cursor-pointer rounded-full border px-3 py-1.5 text-xs has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
                    value === slot.start
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line-strong bg-surface-raised text-fg hover:bg-surface-sunken",
                  )}
                >
                  <input
                    id={id}
                    type="radio"
                    name={name}
                    value={slot.start}
                    checked={value === slot.start}
                    onChange={() => onChange(slot.start)}
                    className="sr-only"
                  />
                  {time}
                  {local ? <span className="sr-only"> Sylhet, {local}</span> : null}
                  {local ? <span aria-hidden="true" className="ml-1 opacity-80">· {local}</span> : null}
                </label>
              );
            })}
          </div>
        ))}
      </div>
    </fieldset>
  );
}
