"use server";

import { getCurrentUser } from "@/lib/server/auth";
import * as bookings from "@/lib/server/viewing-bookings";

// Booking actions (spec 0007, *Actions and reads*). Each reads the session
// itself; the service checks the visitor, the conversation, the shown set, and
// the slot under row locks.

const signedOut = { ok: false as const, reason: "not_found" as const };

export async function getBookingCardDataAction(input: { conversationId: string; listingId: string }) {
  const user = await getCurrentUser();
  if (!user) return signedOut;
  return bookings.getBookingCardData(input, user);
}

export async function requestViewingAction(input: Parameters<typeof bookings.requestViewing>[0]) {
  const user = await getCurrentUser();
  if (!user) return signedOut;
  const result = await bookings.requestViewing(input, user);
  if (!result.ok || !result.message) return result;
  const cards = await bookings.viewingCards(bookings.viewingRefsIn([result.message]), user);
  return { ...result, cards };
}

export async function changeViewingTimeAction(input: { viewingId: string; start: string }) {
  const user = await getCurrentUser();
  if (!user) return signedOut;
  return bookings.changeViewingTime(input, user);
}

export async function cancelViewingAction(input: { viewingId: string; reason?: string }) {
  const user = await getCurrentUser();
  if (!user) return signedOut;
  return bookings.cancelViewing(input, user);
}

// Fresh state for confirmation cards after a change (AC-8).
export async function viewingCardsAction(refs: { leadId: string; viewingId: string }[]) {
  const user = await getCurrentUser();
  if (!user || !Array.isArray(refs)) return {};
  return bookings.viewingCards(refs.slice(0, 50), user);
}

export async function availableSlotsAction() {
  const { availableSlots } = await import("@/lib/domain/viewing-slots");
  return availableSlots(new Date());
}
