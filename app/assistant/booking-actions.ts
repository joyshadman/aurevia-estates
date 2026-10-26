"use server";

import { isSupportedCountry, parsePhoneNumberFromString } from "libphonenumber-js/min";
import { z } from "zod";
import { InvalidTransitionError } from "@/lib/domain/errors";
import type { ViewingSlot } from "@/lib/domain/viewing-slots";
import { getCurrentUser } from "@/lib/server/auth";
import * as bookings from "@/lib/server/bookings";
import type { ChatMessageInput } from "@/lib/server/chat-store";
import {
  AlreadyBookedError,
  ForbiddenError,
  ListingNotBookableError,
  NotFoundError,
  StaleStatusError,
  type ExistingViewing,
} from "@/lib/server/errors";
import { reportError } from "@/lib/server/report";
import * as cards from "@/lib/server/viewing-cards";
import type { BookingErrorReason, BookingField } from "./messages";

// Booking actions (spec 0007, *Actions and reads*). Each reads the user first
// (`refresh: true`, spec 0008) and never redirects; refusals come back as
// `{ ok: false, reason }`, with the words in `./messages.ts`.

export type BookingFailure =
  | { ok: false; reason: Exclude<BookingErrorReason, "invalid" | "slot_unavailable" | "already_booked"> }
  | { ok: false; reason: "invalid"; field: BookingField }
  | { ok: false; reason: "slot_unavailable"; slots: ViewingSlot[] }
  | { ok: false; reason: "already_booked"; existing: ExistingViewing };

const uuid = z.uuid();
const maxLeadIds = 20;

// *Error mapping*: one place turns service errors into reasons.
async function mapErrors<T>(work: () => Promise<T>): Promise<T | BookingFailure> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) return { ok: false, reason: "not_found" };
    if (error instanceof StaleStatusError || error instanceof InvalidTransitionError) return { ok: false, reason: "stale_status" };
    if (error instanceof ListingNotBookableError) return { ok: false, reason: "listing_unavailable" };
    if (error instanceof AlreadyBookedError) return { ok: false, reason: "already_booked", existing: error.existing };
    reportError("booking.action_failed", error);
    throw error;
  }
}

async function currentUser() {
  return getCurrentUser({ refresh: true });
}

// A booking card that appears live (AC-2); a reopened chat gets its data from the page.
export async function getBookingCardData(input: {
  conversationId: string;
  listingId: string;
}): Promise<{ ok: true; data: cards.BookingCardData } | BookingFailure> {
  const user = await currentUser();
  if (!user) return { ok: false, reason: "not_found" };
  if (!uuid.safeParse(input.conversationId).success || !uuid.safeParse(input.listingId).success) {
    return { ok: false, reason: "not_found" };
  }
  return mapErrors(async () => {
    const result = await cards.bookingCardData(user, input.conversationId, [input.listingId]);
    if (!result.ok) return result;
    const data = result.cards[input.listingId];
    return data ? { ok: true as const, data } : { ok: false as const, reason: "not_found" as const };
  });
}

// Confirmation cards that appear live (AC-5, AC-8).
export async function getViewingCards(input: {
  conversationId: string;
  leadIds: string[];
}): Promise<{ ok: true; cards: Record<string, cards.ViewingCard> } | BookingFailure> {
  const user = await currentUser();
  if (!user) return { ok: false, reason: "not_found" };
  const parsed = z.object({ conversationId: uuid, leadIds: z.array(uuid).max(maxLeadIds) }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "not_found" };
  return mapErrors(async () => {
    if (!(await cards.ownsConversation(user, parsed.data.conversationId))) return { ok: false as const, reason: "not_found" as const };
    return { ok: true as const, cards: await cards.viewingCards(user, parsed.data.leadIds) };
  });
}

const requestInput = z.object({
  conversationId: uuid,
  listingId: uuid,
  start: z.iso.datetime({ offset: true }),
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(1).max(40),
  countryCode: z.string().length(2),
  whatsapp: z.boolean(),
  note: z.string().trim().max(500).optional(),
});

function invalidField(error: z.ZodError, fields: readonly BookingField[]): BookingField {
  const path = error.issues[0]?.path[0];
  // The country select belongs to the phone field.
  if (path === "countryCode") return "phone";
  return fields.find((field) => field === path) ?? fields[0];
}

// The phone in E.164, parsed against the form's country (spec 0008's rule).
function e164(phone: string, countryCode: string): string | null {
  if (!isSupportedCountry(countryCode)) return null;
  const number = parsePhoneNumberFromString(phone, countryCode);
  return number?.isValid() ? number.number : null;
}

// AC-4 to AC-7, AC-10, AC-12.
export async function requestViewing(
  input: z.input<typeof requestInput>,
): Promise<{ ok: true; leadId: string; viewingId: string; reused: boolean; message: ChatMessageInput | null } | BookingFailure> {
  const user = await currentUser();
  if (!user) return { ok: false, reason: "signed_out" };
  const parsed = requestInput.safeParse(input);
  if (!parsed.success) {
    const field = invalidField(parsed.error, ["name", "phone", "note", "start"]);
    // Ids that don't parse are not a form mistake.
    if (["conversationId", "listingId"].includes(String(parsed.error.issues[0]?.path[0]))) return { ok: false, reason: "not_found" };
    return { ok: false, reason: "invalid", field };
  }
  const phone = e164(parsed.data.phone, parsed.data.countryCode);
  if (!phone) return { ok: false, reason: "invalid", field: "phone" };

  return mapErrors(() =>
    bookings.requestViewing(user, {
      conversationId: parsed.data.conversationId,
      listingId: parsed.data.listingId,
      start: new Date(parsed.data.start),
      name: parsed.data.name,
      phone,
      whatsapp: parsed.data.whatsapp,
      note: parsed.data.note || undefined,
    }),
  );
}

// AC-9, AC-10.
export async function changeViewingTime(input: {
  viewingId: string;
  start: string;
}): Promise<{ ok: true; viewingId: string } | BookingFailure> {
  const user = await currentUser();
  if (!user) return { ok: false, reason: "signed_out" };
  const parsed = z.object({ viewingId: uuid, start: z.iso.datetime({ offset: true }) }).safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues[0]?.path[0] === "start" ? { ok: false, reason: "invalid", field: "start" } : { ok: false, reason: "not_found" };
  }
  return mapErrors(() => bookings.changeViewingTime(user, parsed.data.viewingId, new Date(parsed.data.start)));
}

// AC-9.
export async function cancelViewing(input: { viewingId: string; reason?: string }): Promise<{ ok: true } | BookingFailure> {
  const user = await currentUser();
  if (!user) return { ok: false, reason: "signed_out" };
  const parsed = z.object({ viewingId: uuid, reason: z.string().trim().max(200).optional() }).safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues[0]?.path[0] === "reason" ? { ok: false, reason: "invalid", field: "reason" } : { ok: false, reason: "not_found" };
  }
  return mapErrors(() => bookings.cancelViewing(user, parsed.data.viewingId, parsed.data.reason));
}

// AC-11. Visitors only; anyone else gets empty lists.
export async function listMyViewings(): Promise<{ upcoming: cards.ViewingCard[]; recent: cards.ViewingCard[] }> {
  const user = await currentUser();
  if (!user) return { upcoming: [], recent: [] };
  return cards.listMyViewings(user);
}
