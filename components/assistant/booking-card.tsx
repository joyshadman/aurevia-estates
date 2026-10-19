"use client";

import { CalendarPlus } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { bookingReasonMessages } from "@/lib/domain/booking-messages";
import type { ChatMessageInput } from "@/lib/server/chat-store";
import type { BookingCardData, ViewingCard } from "@/lib/server/viewing-bookings";
import { getBookingCardDataAction, requestViewingAction } from "@/app/assistant/booking-actions";
import { SlotPicker, ViewingTime } from "./viewing-time";

// The booking card the `offerViewing` tool shows (spec 0007, AC-2 to AC-6).
// Nothing is booked until Confirm. Slots, prefill, and any existing viewing are
// fetched when it renders, so a reopened chat never shows stale ones.

type Props = {
  conversationId: string | null;
  listingId: string;
  suggestedNote: string | null;
  // A later confirmation for this home exists in the chat.
  sent: boolean;
  // The assistant is still replying (AC-2).
  replying: boolean;
  onBooked: (message: ChatMessageInput, cards: Record<string, ViewingCard>) => void;
};

export function BookingCard({ conversationId, listingId, suggestedNote, sent, replying, onBooked }: Props) {
  const [data, setData] = useState<BookingCardData | null>(null);
  const [failed, setFailed] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("BD");
  const [whatsapp, setWhatsapp] = useState(true);
  const [note, setNote] = useState(suggestedNote ?? "");
  const [slot, setSlot] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!conversationId || sent) return;
    let live = true;
    void getBookingCardDataAction({ conversationId, listingId }).then((result) => {
      if (!live) return;
      if (!result.ok) {
        setFailed(true);
        return;
      }
      setData(result);
      setName(result.prefill.name);
      setPhone(result.prefill.phone);
      setCountry(result.prefill.countryCode);
      setWhatsapp(result.prefill.whatsapp);
    });
    return () => {
      live = false;
    };
  }, [conversationId, listingId, sent]);

  if (sent || done) {
    return <p className="text-xs text-fg-subtle">Booking sent</p>;
  }
  if (failed) return <p className="text-sm text-fg-muted">This booking card is no longer available.</p>;
  if (!data) return <Skeleton className="h-64 max-w-xl rounded-2xl" />;

  if (data.listingStatus !== "PUBLISHED") {
    return <p className="text-sm text-fg-muted">{`${data.title} can't be booked right now.`}</p>;
  }
  if (data.existing) {
    return (
      <div className="flex max-w-xl flex-col gap-2 rounded-2xl border border-line bg-surface-raised p-5 text-sm">
        <p className="text-fg">
          You already have a viewing for this home on <ViewingTime start={data.existing.start} />.
        </p>
        <p className="text-xs text-fg-muted">
          {data.existing.canChange ? "Change or cancel it from its confirmation card or your account page." : "To change it, call or WhatsApp your advisor."}
        </p>
      </div>
    );
  }

  const canConfirm = name.trim().length >= 1 && name.trim().length <= 80 && phone.trim() !== "" && slot !== null && !replying;
  const prefix = `book-${listingId}`;

  function confirm() {
    if (!conversationId || !slot) return;
    startTransition(async () => {
      const result = await requestViewingAction({
        conversationId,
        listingId,
        start: slot,
        name,
        phone,
        countryCode: country,
        whatsapp,
        note: note.trim() || undefined,
      });
      if (!result.ok) {
        setErrors(("fieldErrors" in result && result.fieldErrors) || {});
        if ("slots" in result && result.slots) {
          setData((d) => (d ? { ...d, slots: result.slots! } : d));
          setSlot(null);
        }
        if ("existing" in result && result.existing) setData((d) => (d ? { ...d, existing: result.existing! } : d));
        setMessage(bookingReasonMessages[result.reason] ?? "Something went wrong. Try again.");
        return;
      }
      setDone(true);
      if ("cards" in result && result.message) onBooked(result.message, result.cards);
    });
  }

  return (
    <form
      className="flex max-w-xl flex-col gap-4 rounded-2xl border border-line bg-surface-raised p-5"
      onSubmit={(e) => {
        e.preventDefault();
        confirm();
      }}
      aria-labelledby={`${prefix}-title`}
    >
      <div className="flex items-start gap-3">
        <CalendarPlus aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <div>
          <h3 id={`${prefix}-title`} className="text-sm font-medium text-fg">
            Book a viewing: {data.title}
          </h3>
          <p className="text-xs text-fg-subtle">
            {data.areaName} · {data.refCode} · Advisor: {data.advisorName}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${prefix}-name`} label="Your name" error={errors.name} showError>
          <Input value={name} maxLength={80} autoComplete="name" onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span id={`${prefix}-phone-label`} className="text-sm font-medium text-fg">
            Phone
          </span>
          <div className="flex gap-2">
            <label htmlFor={`${prefix}-country`} className="sr-only">
              Country
            </label>
            <Select id={`${prefix}-country`} value={country} onChange={(e) => setCountry(e.target.value)} className="w-28">
              {data.countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} {c.dial}
                </option>
              ))}
            </Select>
            <Input
              id={`${prefix}-phone`}
              aria-labelledby={`${prefix}-phone-label`}
              aria-describedby={errors.phone ? `${prefix}-phone-error` : undefined}
              aria-invalid={errors.phone ? true : undefined}
              type="tel"
              autoComplete="tel-national"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          {errors.phone ? (
            <p id={`${prefix}-phone-error`} role="alert" className="text-xs font-medium text-danger">
              {errors.phone}
            </p>
          ) : null}
        </div>
      </div>
      <Checkbox id={`${prefix}-whatsapp`} label="This number is on WhatsApp" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} />
      <Field id={`${prefix}-note`} label="Note for your advisor (optional)" error={errors.note} showError>
        <Textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <SlotPicker slots={data.slots} value={slot} onChange={setSlot} name={`${prefix}-slot`} />

      {message ? (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-fg-subtle">{replying ? "Wait for the assistant to finish." : "Nothing is booked until you confirm."}</p>
        <Button type="submit" loading={pending} disabled={!canConfirm}>
          Confirm viewing
        </Button>
      </div>
    </form>
  );
}
