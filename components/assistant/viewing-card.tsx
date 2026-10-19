"use client";

import { CalendarCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { bookingReasonMessages } from "@/lib/domain/booking-messages";
import type { Slot } from "@/lib/domain/viewing-slots";
import type { ViewingCard } from "@/lib/server/viewing-bookings";
import { availableSlotsAction, cancelViewingAction, changeViewingTimeAction } from "@/app/assistant/booking-actions";
import { SlotPicker, ViewingTime } from "./viewing-time";

// A booking that follows its lead (spec 0007, AC-5, AC-8, AC-9): the current
// viewing from the database, with Change time and Cancel while allowed.

const statusLabel: Record<string, { label: string; tone: "neutral" | "accent" | "success" | "warning" | "danger" }> = {
  REQUESTED: { label: "Requested", tone: "accent" },
  CONFIRMED: { label: "Confirmed", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  COMPLETED: { label: "Completed", tone: "success" },
  NO_SHOW: { label: "No show", tone: "warning" },
};

export function ViewingCardView({ card, onChanged }: { card: ViewingCard; onChanged: () => void }) {
  const [mode, setMode] = useState<"view" | "change" | "cancel">("view");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slot, setSlot] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const { current } = card;
  const active = current.status === "REQUESTED" || current.status === "CONFIRMED";
  const status = current.awaitingUpdate ? { label: "Awaiting update", tone: "warning" as const } : statusLabel[current.status];

  function openChange() {
    startTransition(async () => {
      setSlots(await availableSlotsAction());
      setSlot(null);
      setMode("change");
    });
  }

  function submit() {
    startTransition(async () => {
      const result =
        mode === "change" && slot
          ? await changeViewingTimeAction({ viewingId: current.viewingId, start: slot })
          : await cancelViewingAction({ viewingId: current.viewingId, reason });
      if (!result.ok) {
        toast({ tone: "danger", title: bookingReasonMessages[result.reason] ?? "Something went wrong." });
        if ("slots" in result && result.slots) setSlots(result.slots);
        return;
      }
      toast({ tone: "success", title: mode === "change" ? "New time requested" : "Viewing cancelled" });
      setMode("view");
      onChanged();
    });
  }

  return (
    <article className="flex max-w-xl flex-col gap-3 rounded-2xl border border-line bg-surface-raised p-5">
      <div className="flex items-start gap-3">
        <CalendarCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="text-sm font-medium text-fg">
            Viewing: {card.listing.title} <span className="text-fg-subtle">({card.listing.refCode})</span>
          </h3>
          <ViewingTime start={current.start} className="text-sm text-fg" />
          <div className="flex flex-wrap items-center gap-2">
            {status ? <Badge tone={status.tone}>{status.label}</Badge> : null}
            {card.rescheduled ? <span className="text-xs text-fg-muted">Rescheduled to this time</span> : null}
          </div>
          <p className="text-xs text-fg-muted">
            Advisor: {card.advisorName}. {active && !current.awaitingUpdate ? "Your advisor will confirm by phone or WhatsApp." : ""}
          </p>
          {active && !card.listing.available ? <p className="text-xs text-danger">This home is no longer available.</p> : null}
        </div>
      </div>

      {active && mode === "view" ? (
        current.canChange ? (
          <div className="flex gap-2">
            <Button size="sm" intent="secondary" onClick={openChange} loading={pending}>
              Change time
            </Button>
            <Button size="sm" intent="ghost" onClick={() => setMode("cancel")}>
              Cancel viewing
            </Button>
          </div>
        ) : (
          <p className="text-xs text-fg-muted">To change this viewing, call or WhatsApp your advisor.</p>
        )
      ) : null}

      {mode === "change" ? (
        <div className="flex flex-col gap-3 border-t border-line pt-3">
          <SlotPicker slots={slots} value={slot} onChange={setSlot} name={`change-${current.viewingId}`} />
          <div className="flex justify-end gap-2">
            <Button size="sm" intent="ghost" onClick={() => setMode("view")}>
              Keep this time
            </Button>
            <Button size="sm" onClick={submit} loading={pending} disabled={!slot}>
              Request new time
            </Button>
          </div>
        </div>
      ) : null}

      {mode === "cancel" ? (
        <div className="flex flex-col gap-3 border-t border-line pt-3">
          <Field id={`cancel-${current.viewingId}`} label="Reason (optional)">
            <Input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button size="sm" intent="ghost" onClick={() => setMode("view")}>
              Keep viewing
            </Button>
            <Button size="sm" intent="danger" onClick={submit} loading={pending}>
              Cancel viewing
            </Button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
