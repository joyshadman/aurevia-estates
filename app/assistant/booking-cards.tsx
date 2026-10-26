"use client";

import { CalendarCheck, CalendarPlus, Check, CircleAlert, UserRound } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Eyebrow } from "@/components/ui/layout";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { CountryOption } from "@/lib/domain/phone-countries";
import { canVisitorChange, isActiveViewing, type ViewingSlot } from "@/lib/domain/viewing-slots";
import type { ChatMessageInput } from "@/lib/server/chat-store";
import type { BookingCardData, ViewingCard } from "@/lib/server/viewing-cards";
import { track } from "@/lib/analytics";
import { requestViewing, type BookingFailure } from "./booking-actions";
import type { BookingField } from "./messages";
import { failureMessage, SlotPicker, ViewingActions, ViewingStateBadge, ViewingTime } from "./viewing-parts";

// The chat's booking cards (spec 0007, *Cards and history*). English in every
// chat, by the engineer's choice.

export type BookingCardLoad = { ok: true; data: BookingCardData } | BookingFailure;

const cardClass = "flex max-w-xl flex-col gap-5 rounded-2xl border border-line bg-surface-raised p-5 shadow-soft sm:p-6";

function CardHeader({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent-subtle-fg">
        <CalendarPlus aria-hidden="true" strokeWidth={1.5} className="h-5 w-5" />
      </span>
      <div className="flex flex-col gap-0.5">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h3 className="font-display text-lg text-fg">{title}</h3>
        <p className="text-sm text-fg-muted">{detail}</p>
      </div>
    </div>
  );
}

function Advisor({ name }: { name: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-fg-muted">
      <UserRound aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
      Your advisor: <span className="font-medium text-fg">{name}</span>
    </p>
  );
}

// A `tool-offerViewing` part (AC-1 to AC-4, AC-6). Nothing is booked until Confirm.
export function BookingCard({
  conversationId,
  refCode,
  suggestedNote,
  load,
  countries,
  busy,
  sent,
  onBooked,
  onReload,
}: {
  conversationId: string;
  refCode: string;
  suggestedNote: string | null;
  load: BookingCardLoad | undefined;
  countries: CountryOption[];
  // The assistant is still replying (AC-2).
  busy: boolean;
  // A confirmation card for this home follows later in the chat.
  sent: boolean;
  onBooked: (message: ChatMessageInput | null) => void;
  onReload: () => void | Promise<void>;
}) {
  const [submitted, setSubmitted] = useState(false);

  if (sent || submitted) {
    return (
      <p className="flex items-center gap-2 text-sm text-fg-subtle">
        <Check aria-hidden="true" strokeWidth={1.5} className="h-4 w-4 text-success" />
        Booking sent for {refCode}
      </p>
    );
  }
  if (!load) return <Skeleton className="h-96 w-full max-w-xl rounded-2xl" />;
  if (!load.ok) {
    return (
      <p className="flex items-center gap-2 text-sm text-fg-muted">
        <CircleAlert aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
        {failureMessage(load)}
      </p>
    );
  }

  const { data } = load;
  const detail = `${data.areaName} · ${data.refCode}`;

  if (!data.listingAvailable) {
    return (
      <div className={cardClass}>
        <CardHeader eyebrow="Book a viewing" title={data.title} detail={detail} />
        <p className="text-sm text-fg-muted">This home can&apos;t be booked right now.</p>
      </div>
    );
  }

  if (data.existing) {
    const existing = data.existing;
    return (
      <div className={cardClass}>
        <CardHeader eyebrow="You already have a viewing" title={data.title} detail={detail} />
        <div className="flex flex-col gap-1">
          <p className="text-sm text-fg-muted">You already have a viewing for this home on</p>
          <ViewingTime start={existing.start} />
        </div>
        <Advisor name={data.advisorName} />
        <ViewingActions
          viewing={{
            viewingId: existing.viewingId,
            start: existing.start,
            active: isActiveViewing(existing.status),
            canChange: canVisitorChange({ status: existing.status, requestedFor: existing.start, confirmedFor: null }),
            leadOpen: true,
            listingAvailable: true,
          }}
          onChanged={onReload}
        />
      </div>
    );
  }

  return (
    <BookingForm
      key={data.listingId}
      conversationId={conversationId}
      data={data}
      detail={detail}
      suggestedNote={suggestedNote}
      countries={countries}
      busy={busy}
      onBooked={(message) => {
        setSubmitted(true);
        onBooked(message);
      }}
      onReload={onReload}
    />
  );
}

function BookingForm({
  conversationId,
  data,
  detail,
  suggestedNote,
  countries,
  busy,
  onBooked,
  onReload,
}: {
  conversationId: string;
  data: BookingCardData;
  detail: string;
  suggestedNote: string | null;
  countries: CountryOption[];
  busy: boolean;
  onBooked: (message: ChatMessageInput | null) => void;
  onReload: () => void | Promise<void>;
}) {
  const id = useId();
  const [name, setName] = useState(data.prefill.name);
  const [countryCode, setCountryCode] = useState(data.prefill.countryCode);
  const [phone, setPhone] = useState(data.prefill.national);
  const [whatsapp, setWhatsapp] = useState(data.prefill.whatsapp);
  const [note, setNote] = useState(suggestedNote ?? "");
  const [slots, setSlots] = useState<ViewingSlot[]>(data.slots);
  const [start, setStart] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ field: BookingField; message: string } | null>(null);

  const ready = name.trim().length >= 1 && name.trim().length <= 80 && phone.trim() !== "" && start !== null && !busy;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready || pending || !start) return;
    setPending(true);
    setError(null);
    setFieldError(null);
    const result = await requestViewing({
      conversationId,
      listingId: data.listingId,
      start,
      name,
      phone,
      countryCode,
      whatsapp,
      note: note.trim() || undefined,
    });
    setPending(false);
    if (result.ok) {
      // Spec 0018, AC-1: a double submit is not a second booking.
      if (!result.reused) track({ name: "viewing_booked", props: { ref_code: data.refCode } });
      onBooked(result.message);
      return;
    }
    if (result.reason === "invalid") {
      setFieldError({ field: result.field, message: failureMessage(result) });
      return;
    }
    if (result.reason === "slot_unavailable") {
      // AC-3: a stale slot reloads the card's slots.
      setSlots(result.slots);
      setStart(null);
    }
    if (result.reason === "already_booked") {
      await onReload();
      return;
    }
    setError(failureMessage(result));
  };

  const errorFor = (field: BookingField) => (fieldError?.field === field ? fieldError.message : undefined);

  return (
    <form onSubmit={submit} className={cardClass} aria-labelledby={`${id}-title`} noValidate>
      <div id={`${id}-title`}>
        <CardHeader eyebrow="Book a viewing" title={data.title} detail={detail} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${id}-name`} label="Your name" error={errorFor("name")} showError className="sm:col-span-2">
          <Input
            value={name}
            maxLength={80}
            autoComplete="name"
            onChange={(event) => setName(event.target.value)}
            disabled={pending}
            required
          />
        </Field>
        <Field id={`${id}-country`} label="Country">
          <Select
            value={countryCode}
            autoComplete="country"
            onChange={(event) => setCountryCode(event.target.value)}
            disabled={pending}
          >
            {countries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={`${id}-phone`} label="Phone" error={errorFor("phone")} showError>
          <Input
            type="tel"
            value={phone}
            autoComplete="tel-national"
            maxLength={40}
            onChange={(event) => setPhone(event.target.value)}
            disabled={pending}
            required
          />
        </Field>
        <Checkbox
          id={`${id}-whatsapp`}
          label="This number is on WhatsApp"
          checked={whatsapp}
          onChange={(event) => setWhatsapp(event.target.checked)}
          disabled={pending}
          className="sm:col-span-2"
        />
        <Field
          id={`${id}-note`}
          label="Note for your advisor (optional)"
          hint="Up to 500 characters."
          error={errorFor("note")}
          showError
          className="sm:col-span-2"
        >
          <Textarea rows={3} value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} disabled={pending} />
        </Field>
      </div>

      <SlotPicker slots={slots} value={start} onChange={setStart} legend="Pick a time" disabled={pending} />

      <Advisor name={data.advisorName} />

      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-subtle px-4 py-3 text-sm text-danger-subtle-fg">
          <CircleAlert aria-hidden="true" strokeWidth={1.5} className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-fg-subtle">
          {busy ? "One moment, the assistant is still replying." : "Nothing is booked until you press Confirm."}
        </p>
        <Button type="submit" loading={pending} disabled={!ready} className="self-start sm:self-auto">
          Confirm viewing
        </Button>
      </div>
    </form>
  );
}

// A `data-viewing` part (AC-5, AC-8, AC-9): always the lead's current viewing.
export function ViewingConfirmation({
  viewingId,
  card,
  onChanged,
}: {
  // The viewing this card was saved for.
  viewingId: string;
  card: ViewingCard | undefined;
  onChanged: () => void | Promise<void>;
}) {
  if (!card) return <Skeleton className="h-48 w-full max-w-xl rounded-2xl" />;

  const active = card.state === "REQUESTED" || card.state === "CONFIRMED" || card.state === "AWAITING_UPDATE";
  const rescheduled = card.viewingId !== viewingId && card.rescheduledIds.includes(viewingId);

  return (
    <section className={cardClass} aria-label={`Viewing for ${card.refCode}`}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success-subtle text-success-subtle-fg">
          <CalendarCheck aria-hidden="true" strokeWidth={1.5} className="h-5 w-5" />
        </span>
        <div className="flex flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Eyebrow>{rescheduled ? "Viewing rescheduled" : "Viewing request"}</Eyebrow>
            <ViewingStateBadge state={card.state} />
          </div>
          <h3 className="font-display text-lg text-fg">{card.title}</h3>
          <p className="text-sm text-fg-muted">{card.refCode}</p>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {rescheduled ? <p className="text-sm text-fg-muted">Rescheduled to</p> : null}
        <ViewingTime start={card.start} />
      </div>

      <Advisor name={card.advisorName} />

      {active && !card.listingAvailable ? (
        <p className="text-sm font-medium text-warning-subtle-fg">This home is no longer available.</p>
      ) : card.state === "REQUESTED" ? (
        <p className="text-sm text-fg-muted">Your advisor will confirm by phone or WhatsApp.</p>
      ) : null}

      <ViewingActions viewing={{ ...card, active }} onChanged={onChanged} />
    </section>
  );
}
