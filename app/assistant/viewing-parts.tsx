"use client";

import { CalendarClock, Phone } from "lucide-react";
import { useId, useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Eyebrow } from "@/components/ui/layout";
import { cn } from "@/lib/cn";
import {
  availableSlots,
  differsFromDhaka,
  formatClock,
  formatSlotDay,
  formatViewingTime,
  zoneCity,
  type ViewingSlot,
} from "@/lib/domain/viewing-slots";
import type { ViewingCard, ViewingState } from "@/lib/server/viewing-cards";
import { cancelViewing, changeViewingTime, type BookingFailure } from "./booking-actions";
import { bookingErrorMessages, bookingFieldMessages } from "./messages";

// Booking pieces shared by the chat cards and `/account` (spec 0007, *Cards
// and history*, *Account page section*). Times are English, 12 hour.

const noSubscribe = () => () => {};

// The visitor's time zone, known only in the browser. Null on the server and
// during hydration, so server and client HTML match (AC-3).
export function useLocalTimeZone(): string | null {
  return useSyncExternalStore(
    noSubscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null,
  );
}

// "Sun 19 Oct, 3:00 PM Sylhet", plus the visitor's own time when their zone's
// offset at that instant differs from Dhaka's (AC-3).
export function ViewingTime({ start, className }: { start: string; className?: string }) {
  const zone = useLocalTimeZone();
  const local = zone && differsFromDhaka(zone, start) ? zone : null;
  return (
    <span className={className}>
      <span className="font-medium text-fg">{formatViewingTime(start)} Sylhet</span>
      {local ? (
        <span className="block text-sm text-fg-muted">
          {formatViewingTime(start, local)} {zoneCity(local)}
        </span>
      ) : null}
    </span>
  );
}

export function failureMessage(failure: BookingFailure): string {
  if (failure.reason === "invalid") return bookingFieldMessages[failure.field];
  if (failure.reason === "already_booked") {
    return `You already have a viewing for this home on ${formatViewingTime(failure.existing.start)} Sylhet.`;
  }
  return bookingErrorMessages[failure.reason];
}

// Slots grouped by day as one radio group (AC-3). Native radios, so arrow keys
// move within the group.
export function SlotPicker({
  slots,
  value,
  onChange,
  legend,
  disabled = false,
  exclude,
}: {
  slots: ViewingSlot[];
  value: string | null;
  onChange: (start: string) => void;
  legend: string;
  disabled?: boolean;
  // The current time, when changing it (AC-9: a different slot).
  exclude?: string;
}) {
  const name = useId();
  const zone = useLocalTimeZone();
  const days = useMemo(() => {
    const byDay = new Map<string, ViewingSlot[]>();
    for (const slot of slots) {
      if (exclude && new Date(slot.start).getTime() === new Date(exclude).getTime()) continue;
      byDay.set(slot.date, [...(byDay.get(slot.date) ?? []), slot]);
    }
    return [...byDay.entries()];
  }, [slots, exclude]);

  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled}>
      <legend className="mb-1 text-sm font-medium text-fg">{legend}</legend>
      <p className="-mt-1 text-xs text-fg-subtle">Times are Sylhet time. Open every day except Friday.</p>
      <div className="flex max-h-72 flex-col gap-4 overflow-y-auto pr-1">
        {days.map(([date, daySlots]) => (
          <div key={date} className="flex flex-col gap-2">
            <Eyebrow className="font-medium">{formatSlotDay(date)}</Eyebrow>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {daySlots.map((slot) => {
                const local = zone && differsFromDhaka(zone, slot.start) ? zone : null;
                const checked = value !== null && new Date(value).getTime() === new Date(slot.start).getTime();
                return (
                  <label
                    key={slot.start}
                    // The radio is visually hidden, so its focus ring moves to the tile.
                    className={cn(
                      "flex min-h-11 cursor-pointer flex-col justify-center rounded-xl border px-3 py-2 text-sm transition-colors duration-fast has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus",
                      checked
                        ? "border-accent bg-accent-subtle text-accent-subtle-fg"
                        : "border-line-strong bg-surface-raised text-fg hover:bg-surface-sunken",
                    )}
                  >
                    <input
                      type="radio"
                      name={name}
                      value={slot.start}
                      checked={checked}
                      onChange={() => onChange(slot.start)}
                      className="sr-only"
                    />
                    <span className="font-medium">{formatClock(slot.start)}</span>
                    {local ? (
                      <span className="text-xs opacity-80">
                        {formatClock(slot.start, local)} {zoneCity(local)}
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

const stateLabels: Record<ViewingState, { label: string; tone: "neutral" | "accent" | "success" | "warning" | "danger" }> = {
  REQUESTED: { label: "Requested", tone: "accent" },
  CONFIRMED: { label: "Confirmed", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  COMPLETED: { label: "Completed", tone: "success" },
  NO_SHOW: { label: "No show", tone: "danger" },
  AWAITING_UPDATE: { label: "Awaiting update", tone: "warning" },
};

export function ViewingStateBadge({ state }: { state: ViewingState }) {
  const { label, tone } = stateLabels[state];
  return <Badge tone={tone}>{label}</Badge>;
}

type ActionTarget = Pick<ViewingCard, "viewingId" | "start" | "canChange" | "leadOpen" | "listingAvailable"> & {
  active: boolean;
};

// Change time and Cancel (AC-9), or "Call or WhatsApp your advisor" within 2 hours.
export function ViewingActions({
  viewing,
  onChanged,
}: {
  viewing: ActionTarget;
  onChanged: () => void | Promise<void>;
}) {
  const [mode, setMode] = useState<"idle" | "change" | "cancel">("idle");
  const [start, setStart] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [slots, setSlots] = useState<ViewingSlot[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reasonId = useId();

  if (!viewing.active) return null;
  if (!viewing.canChange) {
    return (
      <p className="flex items-center gap-2 text-sm text-fg-muted">
        <Phone aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
        Call or WhatsApp your advisor to change this viewing.
      </p>
    );
  }

  const canChangeTime = viewing.leadOpen && viewing.listingAvailable;

  const openChange = () => {
    setError(null);
    setStart(null);
    // Slots for the picker, from this moment; the server checks again (AC-3).
    setSlots(availableSlots(new Date()));
    setMode("change");
  };

  const submitChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!start) return;
    setPending(true);
    setError(null);
    const result = await changeViewingTime({ viewingId: viewing.viewingId, start });
    setPending(false);
    if (result.ok) {
      setMode("idle");
      await onChanged();
      return;
    }
    if (result.reason === "slot_unavailable") {
      setSlots(result.slots);
      setStart(null);
    }
    setError(failureMessage(result));
  };

  const submitCancel = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await cancelViewing({ viewingId: viewing.viewingId, reason: reason.trim() || undefined });
    setPending(false);
    if (result.ok) {
      setMode("idle");
      await onChanged();
      return;
    }
    setError(failureMessage(result));
  };

  return (
    <div className="flex flex-col gap-4">
      {mode === "idle" ? (
        <div className="flex flex-wrap gap-2">
          {canChangeTime ? (
            <Button type="button" intent="secondary" size="sm" onClick={openChange}>
              <CalendarClock aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
              Change time
            </Button>
          ) : null}
          <Button
            type="button"
            intent="ghost"
            size="sm"
            onClick={() => {
              setError(null);
              setMode("cancel");
            }}
          >
            Cancel viewing
          </Button>
        </div>
      ) : null}

      {mode === "change" && slots ? (
        <form onSubmit={submitChange} className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4">
          <SlotPicker
            slots={slots}
            value={start}
            onChange={setStart}
            legend="Pick a new time"
            disabled={pending}
            exclude={viewing.start}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" loading={pending} disabled={!start}>
              Change time
            </Button>
            <Button type="button" intent="ghost" size="sm" onClick={() => setMode("idle")} disabled={pending}>
              Keep current time
            </Button>
          </div>
        </form>
      ) : null}

      {mode === "cancel" ? (
        <form onSubmit={submitCancel} className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4">
          <Field id={reasonId} label="Reason (optional)" hint="Up to 200 characters. Your advisor sees it.">
            <Input value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} disabled={pending} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" intent="danger" size="sm" loading={pending}>
              Cancel viewing
            </Button>
            <Button type="button" intent="ghost" size="sm" onClick={() => setMode("idle")} disabled={pending}>
              Keep viewing
            </Button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
