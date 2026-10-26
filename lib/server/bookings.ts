import "server-only";
import { z } from "zod";
import {
  availableSlots,
  canVisitorChange,
  isActiveViewing,
  isAvailableSlot,
  MAX_ACTIVE_VIEWINGS,
  MAX_VISITOR_CHANGES,
  VISITOR_CANCEL_REASON,
  VISITOR_RESCHEDULE_REASON,
  viewingStart,
  type ViewingSlot,
} from "@/lib/domain/viewing-slots";
import type { Lead, Prisma, Viewing } from "@/lib/generated/prisma/client";
import { shownListingIdsFor } from "@/lib/server/assistant/grounding";
import type { Actor } from "@/lib/server/auth";
import { saveServerMessage, turnGuardSeconds, type ChatMessageInput } from "@/lib/server/chat-store";
import { db } from "@/lib/server/db";
import { AlreadyBookedError, ForbiddenError, StaleStatusError, type ExistingViewing } from "@/lib/server/errors";
import { queueBookingEmailsIn } from "@/lib/server/notify";
import { uuidv7 } from "@/lib/server/uuid";
import { transitionViewingIn } from "@/lib/server/viewing-status";

// Booking a viewing (spec 0002, AC-8, AC-9; spec 0007). One open lead per
// visitor and listing, one active viewing per lead, both enforced by partial
// unique indexes and resolved with `on conflict do nothing`, so a double click
// is idempotent. Never catch P2002 inside a transaction: the conflict clauses
// make it unnecessary.

const openLeadStatuses = ["NEW", "CONTACTED", "QUALIFIED"] as const;

export const bookingInput = z.object({
  listingId: z.uuid(),
  requestedFor: z.date(),
  // Matches `updateProfile` (spec 0008).
  name: z.string().trim().min(1).max(80),
  // E.164, e.g. +8801712345678.
  phone: z.string().trim().regex(/^\+[1-9][0-9]{7,14}$/, "Use the international form, like +8801712345678"),
  conversationId: z.uuid(),
  note: z.string().trim().max(500).optional(),
  contactWhatsapp: z.boolean(),
});

export type BookingInput = z.input<typeof bookingInput>;

export type BookingResult = { lead: Lead; viewing: Viewing; leadReused: boolean; viewingReused: boolean };

// Runs inside the caller's transaction (spec 0007, *Data model*). Checks only
// the role: the caller has already checked the listing and the conversation,
// and has saved the profile.
export async function findOrCreateLeadAndViewingIn(
  tx: Prisma.TransactionClient,
  rawInput: BookingInput,
  actor: Actor,
): Promise<BookingResult> {
  if (actor.role !== "VISITOR") throw new ForbiddenError();
  const input = bookingInput.parse(rawInput);

  // The snapshot (contact, conversation, agent) is copied when the lead is new.
  const inserted = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO leads (id, source, status, visitor_id, listing_id, conversation_id, assigned_agent_id,
                       contact_name, contact_phone, contact_email, contact_whatsapp, created_at, updated_at)
    VALUES (${uuidv7()}::uuid, 'CHAT_BOOKING', 'NEW', ${actor.id}::uuid, ${input.listingId}::uuid,
            ${input.conversationId}::uuid,
            (SELECT assigned_agent_id FROM listings WHERE id = ${input.listingId}::uuid),
            ${input.name}, ${input.phone},
            (SELECT email FROM profiles WHERE id = ${actor.id}::uuid), ${input.contactWhatsapp}, now(), now())
    ON CONFLICT (visitor_id, listing_id)
      WHERE status IN ('NEW', 'CONTACTED', 'QUALIFIED') AND visitor_id IS NOT NULL AND listing_id IS NOT NULL
      DO NOTHING
    RETURNING id`;
  const leadReused = inserted.length === 0;
  let lead = leadReused
    ? await tx.lead.findFirstOrThrow({
        where: { visitorId: actor.id, listingId: input.listingId, status: { in: [...openLeadStatuses] } },
      })
    : await tx.lead.findUniqueOrThrow({ where: { id: inserted[0].id } });

  // An active viewing is returned unchanged; the caller decides between a
  // double submit and `already_booked`. Changing its time is `rescheduleViewingIn`.
  const newViewing = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO viewings (id, lead_id, requested_for, status, conversation_id, created_at, updated_at)
    VALUES (${uuidv7()}::uuid, ${lead.id}::uuid, ${input.requestedFor}, 'REQUESTED', ${input.conversationId}::uuid, now(), now())
    ON CONFLICT (lead_id) WHERE status IN ('REQUESTED', 'CONFIRMED') DO NOTHING
    RETURNING id`;
  if (newViewing.length === 0) {
    const viewing = await tx.viewing.findFirstOrThrow({
      where: { leadId: lead.id, status: { in: ["REQUESTED", "CONFIRMED"] } },
    });
    return { lead, viewing, leadReused, viewingReused: true };
  }
  const viewing = await tx.viewing.findUniqueOrThrow({ where: { id: newViewing[0].id } });

  const notes: string[] = [];
  if (!leadReused) {
    await tx.leadActivity.create({
      data: { leadId: lead.id, actorId: actor.id, type: "SYSTEM", body: "Lead created from a viewing booking" },
    });
  } else {
    // AC-7: an open lead carries the visitor's latest contact details.
    const contactChanged =
      lead.contactName !== input.name || lead.contactPhone !== input.phone || lead.contactWhatsapp !== input.contactWhatsapp;
    // AC-6: a lead with no conversation (a listing inquiry or contact form) takes this one.
    const takeConversation = lead.conversationId === null;
    if (contactChanged || takeConversation) {
      lead = await tx.lead.update({
        where: { id: lead.id },
        data: {
          ...(contactChanged ? { contactName: input.name, contactPhone: input.phone, contactWhatsapp: input.contactWhatsapp } : {}),
          ...(takeConversation ? { conversationId: input.conversationId } : {}),
        },
      });
    }
    if (contactChanged) notes.push("Contact details updated by the visitor");
    if (!takeConversation && lead.conversationId !== input.conversationId) {
      notes.push("Booked again from another conversation");
    }
  }

  await tx.leadActivity.create({
    data: { leadId: lead.id, actorId: actor.id, type: "VIEWING_CHANGE", toStatus: "REQUESTED" },
  });
  // AC-6: the visitor's note is always a NOTE by the visitor, never `leads.message`.
  if (input.note) notes.push(input.note);
  for (const body of notes) {
    await tx.leadActivity.create({ data: { leadId: lead.id, actorId: actor.id, type: "NOTE", body } });
  }

  return { lead, viewing, leadReused, viewingReused: false };
}

// Cancels the active viewing and requests a new time on the same lead, inside
// the caller's transaction (spec 0002, AC-8; spec 0007, AC-9). The new viewing
// keeps the old one's conversation.
export async function rescheduleViewingIn(
  tx: Prisma.TransactionClient,
  viewingId: string,
  newStart: Date,
  actor: Actor,
  reason: string,
): Promise<Viewing> {
  const cancelled = await transitionViewingIn(tx, viewingId, "CANCELLED", actor, { cancelReason: reason });
  const inserted = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO viewings (id, lead_id, requested_for, status, conversation_id, created_at, updated_at)
    VALUES (${uuidv7()}::uuid, ${cancelled.leadId}::uuid, ${newStart}, 'REQUESTED', ${cancelled.conversationId}::uuid, now(), now())
    ON CONFLICT (lead_id) WHERE status IN ('REQUESTED', 'CONFIRMED') DO NOTHING
    RETURNING id`;
  if (inserted.length === 0) throw new StaleStatusError("viewing", viewingId);
  await tx.leadActivity.create({
    data: { leadId: cancelled.leadId, actorId: actor.id, type: "VIEWING_CHANGE", toStatus: "REQUESTED" },
  });
  return tx.viewing.findUniqueOrThrow({ where: { id: inserted[0].id } });
}

// ---------------------------------------------------------------------------
// The visitor's booking actions (spec 0007, *Actions and reads*). Refusals are
// returned; typed errors thrown here are mapped to reasons by the action.

// The confirmation card's message (spec 0007, *Cards and history*).
export type ViewingPartData = { leadId: string; viewingId: string };

function viewingMessage(data: ViewingPartData): ChatMessageInput {
  return { id: uuidv7(), role: "assistant", parts: [{ type: "data-viewing", data }] };
}

async function conversationHasViewingCard(tx: Prisma.TransactionClient, conversationId: string, leadId: string) {
  const part = JSON.stringify([{ type: "data-viewing", data: { leadId } }]);
  const rows = await tx.$queryRaw<{ found: number }[]>`
    SELECT 1 AS found FROM chat_messages
    WHERE conversation_id = ${conversationId}::uuid AND parts @> ${part}::jsonb
    LIMIT 1`;
  return rows.length > 0;
}

function existingOf(viewing: Viewing): ExistingViewing {
  return {
    viewingId: viewing.id,
    start: viewingStart(viewing).toISOString(),
    status: viewing.status as ExistingViewing["status"],
  };
}

export type RequestViewingInput = {
  conversationId: string;
  listingId: string;
  start: Date;
  name: string;
  // Already E.164 (parsed by the action).
  phone: string;
  whatsapp: boolean;
  note?: string;
};

export type RequestViewingResult =
  | { ok: true; leadId: string; viewingId: string; reused: boolean; message: ChatMessageInput | null }
  | { ok: false; reason: "not_found" | "not_visitor" | "turn_in_progress" | "listing_unavailable" | "too_many_viewings" }
  | { ok: false; reason: "slot_unavailable"; slots: ViewingSlot[] }
  | { ok: false; reason: "already_booked"; existing: ExistingViewing };

// AC-4 to AC-7, AC-10, AC-12, in one transaction. Locks are always taken in the
// order conversation → profile → lead, so concurrent bookings queue.
export async function requestViewing(actor: Actor, input: RequestViewingInput): Promise<RequestViewingResult> {
  return db.$transaction(async (tx): Promise<RequestViewingResult> => {
    const now = new Date();

    // 1. The conversation lock and the turn guard (spec 0006).
    const [conversation] = await tx.$queryRaw<{ user_id: string; busy: boolean }[]>`
      SELECT user_id, coalesce(turn_started_at > now() - make_interval(secs => ${turnGuardSeconds}), false) AS busy
      FROM conversations WHERE id = ${input.conversationId}::uuid FOR UPDATE`;
    if (!conversation || conversation.user_id !== actor.id) return { ok: false, reason: "not_found" };
    if (conversation.busy) return { ok: false, reason: "turn_in_progress" };
    if (actor.role !== "VISITOR") return { ok: false, reason: "not_visitor" };
    // One connection per transaction: queries run one at a time.
    const listing = await tx.listing.findUnique({ where: { id: input.listingId }, select: { status: true } });
    const shown = await shownListingIdsFor(tx, input.conversationId);
    if (!listing || listing.status !== "PUBLISHED" || !shown.has(input.listingId)) {
      return { ok: false, reason: "listing_unavailable" };
    }

    // 2. Every booking by this visitor queues here, so the cap in step 6 holds.
    await tx.$queryRaw`SELECT 1 FROM profiles WHERE id = ${actor.id}::uuid FOR NO KEY UPDATE`;

    // 3. The visitor's open lead on this home, if any.
    const [openLead] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM leads
      WHERE visitor_id = ${actor.id}::uuid AND listing_id = ${input.listingId}::uuid
        AND status IN ('NEW', 'CONTACTED', 'QUALIFIED')
      FOR UPDATE`;

    // A double submit: succeed, and give this chat its card if it has none yet.
    const reuse = async (viewing: Viewing): Promise<RequestViewingResult> => {
      const hasCard = await conversationHasViewingCard(tx, input.conversationId, viewing.leadId);
      const message = hasCard ? null : viewingMessage({ leadId: viewing.leadId, viewingId: viewing.id });
      if (message) await saveServerMessage(tx, input.conversationId, message);
      return { ok: true, leadId: viewing.leadId, viewingId: viewing.id, reused: true, message };
    };

    // 4. Before the slot check, so a double submit across Dhaka midnight still succeeds.
    if (openLead) {
      const active = await tx.viewing.findFirst({
        where: { leadId: openLead.id, status: { in: ["REQUESTED", "CONFIRMED"] } },
      });
      if (active) {
        if (active.requestedFor.getTime() === input.start.getTime()) return reuse(active);
        return { ok: false, reason: "already_booked", existing: existingOf(active) };
      }
    }

    // 5. AC-3.
    if (!isAvailableSlot(input.start, now)) return { ok: false, reason: "slot_unavailable", slots: availableSlots(now) };

    // 6. AC-10: at most 5 active viewings with a future start.
    const [{ count }] = await tx.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count FROM viewings v JOIN leads l ON l.id = v.lead_id
      WHERE l.visitor_id = ${actor.id}::uuid AND v.status IN ('REQUESTED', 'CONFIRMED')
        AND coalesce(v.confirmed_for, v.requested_for) > now()`;
    if (count >= MAX_ACTIVE_VIEWINGS) return { ok: false, reason: "too_many_viewings" };

    // 7. The profile, then the lead and viewing.
    await tx.profile.update({
      where: { id: actor.id },
      data: { fullName: input.name, phone: input.phone, phoneIsWhatsapp: input.whatsapp },
    });
    const booked = await findOrCreateLeadAndViewingIn(
      tx,
      {
        listingId: input.listingId,
        requestedFor: input.start,
        name: input.name,
        phone: input.phone,
        conversationId: input.conversationId,
        note: input.note || undefined,
        contactWhatsapp: input.whatsapp,
      },
      actor,
    );
    if (booked.viewingReused) {
      // A lead created by a booking that raced past step 3.
      if (booked.viewing.requestedFor.getTime() !== input.start.getTime()) {
        throw new AlreadyBookedError(existingOf(booked.viewing));
      }
      return reuse(booked.viewing);
    }

    // 8. The confirmation card, saved with no model call (AC-5).
    const message = viewingMessage({ leadId: booked.lead.id, viewingId: booked.viewing.id });
    await saveServerMessage(tx, input.conversationId, message);
    // 9. Spec 0019, AC-1: the visitor's and the agent's emails, only for a new viewing.
    await queueBookingEmailsIn(tx, booked.viewing.id);
    return { ok: true, leadId: booked.lead.id, viewingId: booked.viewing.id, reused: false, message };
  });
}

type LockedLead = { id: string; visitor_id: string | null; status: string; listing_id: string | null };

// Change and cancel lock the viewing's lead, then read the viewing (spec 0007).
async function lockVisitorViewing(tx: Prisma.TransactionClient, actor: Actor, viewingId: string) {
  if (actor.role !== "VISITOR") return null;
  const [lead] = await tx.$queryRaw<LockedLead[]>`
    SELECT id, visitor_id, status::text AS status, listing_id FROM leads
    WHERE id = (SELECT lead_id FROM viewings WHERE id = ${viewingId}::uuid)
    FOR UPDATE`;
  if (!lead || lead.visitor_id !== actor.id) return null;
  const viewing = await tx.viewing.findUniqueOrThrow({ where: { id: viewingId } });
  return { lead, viewing };
}

export type ChangeViewingResult =
  | { ok: true; viewingId: string }
  | {
      ok: false;
      reason: "not_found" | "stale_status" | "too_late" | "lead_closed" | "listing_unavailable" | "unchanged" | "too_many_changes";
    }
  | { ok: false; reason: "slot_unavailable"; slots: ViewingSlot[] };

// AC-9, AC-10. No conversation lock: it also runs from `/account`.
export async function changeViewingTime(actor: Actor, viewingId: string, start: Date): Promise<ChangeViewingResult> {
  return db.$transaction(async (tx): Promise<ChangeViewingResult> => {
    const now = new Date();
    const locked = await lockVisitorViewing(tx, actor, viewingId);
    if (!locked) return { ok: false, reason: "not_found" };
    const { lead, viewing } = locked;
    if (!isActiveViewing(viewing.status)) return { ok: false, reason: "stale_status" };
    if (!canVisitorChange(viewing, now)) return { ok: false, reason: "too_late" };
    if (!(openLeadStatuses as readonly string[]).includes(lead.status)) return { ok: false, reason: "lead_closed" };
    const listing = lead.listing_id
      ? await tx.listing.findUnique({ where: { id: lead.listing_id }, select: { status: true } })
      : null;
    if (listing?.status !== "PUBLISHED") return { ok: false, reason: "listing_unavailable" };
    if (!isAvailableSlot(start, now)) return { ok: false, reason: "slot_unavailable", slots: availableSlots(now) };
    if (viewingStart(viewing).getTime() === start.getTime()) return { ok: false, reason: "unchanged" };
    const changes = await tx.viewing.count({
      where: { leadId: lead.id, status: "CANCELLED", cancelReason: VISITOR_RESCHEDULE_REASON },
    });
    if (changes >= MAX_VISITOR_CHANGES) return { ok: false, reason: "too_many_changes" };

    const next = await rescheduleViewingIn(tx, viewingId, start, actor, VISITOR_RESCHEDULE_REASON);
    return { ok: true, viewingId: next.id };
  });
}

export type CancelViewingResult = { ok: true } | { ok: false; reason: "not_found" | "stale_status" | "too_late" };

// AC-9: no lead or listing condition.
export async function cancelViewing(actor: Actor, viewingId: string, reason?: string): Promise<CancelViewingResult> {
  return db.$transaction(async (tx): Promise<CancelViewingResult> => {
    const locked = await lockVisitorViewing(tx, actor, viewingId);
    if (!locked) return { ok: false, reason: "not_found" };
    if (!isActiveViewing(locked.viewing.status)) return { ok: false, reason: "stale_status" };
    if (!canVisitorChange(locked.viewing, new Date())) return { ok: false, reason: "too_late" };
    await transitionViewingIn(tx, viewingId, "CANCELLED", actor, { cancelReason: reason?.trim() || VISITOR_CANCEL_REASON });
    return { ok: true };
  });
}
