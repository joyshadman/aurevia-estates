import "server-only";
import { z } from "zod";
import type { Actor } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { ForbiddenError, ListingNotBookableError } from "@/lib/server/errors";
import { uuidv7 } from "@/lib/server/uuid";
import { transitionViewingIn } from "@/lib/server/viewing-status";

// Booking a viewing (spec 0002, AC-8, AC-9). One open lead per visitor and
// listing, one active viewing per lead, both enforced by partial unique indexes
// and resolved with `on conflict do nothing`, so a double click is idempotent.
// Never catch P2002 inside a transaction: the conflict clauses make it unnecessary.

export const bookingInput = z.object({
  listingId: z.uuid(),
  requestedFor: z.date(),
  name: z.string().trim().min(1).max(120),
  // E.164, e.g. +8801712345678.
  phone: z.string().trim().regex(/^\+[1-9][0-9]{7,14}$/, "Use the international form, like +8801712345678"),
  conversationId: z.uuid().optional(),
});

export type BookingInput = z.input<typeof bookingInput>;

export async function findOrCreateLeadAndViewing(rawInput: BookingInput, actor: Actor) {
  if (actor.role !== "VISITOR") throw new ForbiddenError();
  const input = bookingInput.parse(rawInput);

  const listing = await db.listing.findUnique({ where: { id: input.listingId }, select: { status: true } });
  if (!listing || listing.status !== "PUBLISHED") throw new ListingNotBookableError(input.listingId);

  if (input.conversationId) {
    const owned = await db.conversation.count({ where: { id: input.conversationId, userId: actor.id } });
    if (owned === 0) throw new ForbiddenError();
  }

  // Saved first, so the contact snapshot below can never be empty (AC-9).
  await db.profile.update({ where: { id: actor.id }, data: { fullName: input.name, phone: input.phone } });

  return db.$transaction(async (tx) => {
    // The snapshot (contact, conversation, agent) is copied only when the lead is new.
    const inserted = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO leads (id, source, status, visitor_id, listing_id, conversation_id, assigned_agent_id,
                         contact_name, contact_phone, contact_email, created_at, updated_at)
      VALUES (${uuidv7()}::uuid, 'CHAT_BOOKING', 'NEW', ${actor.id}::uuid, ${input.listingId}::uuid,
              ${input.conversationId ?? null}::uuid,
              (SELECT assigned_agent_id FROM listings WHERE id = ${input.listingId}::uuid),
              ${input.name}, ${input.phone},
              (SELECT email FROM profiles WHERE id = ${actor.id}::uuid), now(), now())
      ON CONFLICT (visitor_id, listing_id)
        WHERE status IN ('NEW', 'CONTACTED', 'QUALIFIED') AND visitor_id IS NOT NULL AND listing_id IS NOT NULL
        DO NOTHING
      RETURNING id`;
    const reused = inserted.length === 0;
    const lead = reused
      ? await tx.lead.findFirstOrThrow({
          where: { visitorId: actor.id, listingId: input.listingId, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] } },
        })
      : await tx.lead.findUniqueOrThrow({ where: { id: inserted[0].id } });

    if (!reused) {
      await tx.leadActivity.create({
        data: { leadId: lead.id, actorId: actor.id, type: "SYSTEM", body: "Lead created from a viewing booking" },
      });
    }

    // An active viewing is returned unchanged; changing its time is `rescheduleViewing`.
    const newViewing = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO viewings (id, lead_id, requested_for, status, created_at, updated_at)
      VALUES (${uuidv7()}::uuid, ${lead.id}::uuid, ${input.requestedFor}, 'REQUESTED', now(), now())
      ON CONFLICT (lead_id) WHERE status IN ('REQUESTED', 'CONFIRMED') DO NOTHING
      RETURNING id`;
    const viewing =
      newViewing.length > 0
        ? await tx.viewing.findUniqueOrThrow({ where: { id: newViewing[0].id } })
        : await tx.viewing.findFirstOrThrow({
            where: { leadId: lead.id, status: { in: ["REQUESTED", "CONFIRMED"] } },
          });

    if (newViewing.length > 0) {
      await tx.leadActivity.create({
        data: { leadId: lead.id, actorId: actor.id, type: "VIEWING_CHANGE", toStatus: "REQUESTED" },
      });
    }

    return { lead, viewing, reused };
  });
}

// Cancels the active viewing and requests a new time, in one transaction (AC-8).
export async function rescheduleViewing(viewingId: string, requestedFor: Date, actor: Actor) {
  return db.$transaction(async (tx) => {
    const cancelled = await transitionViewingIn(tx, viewingId, "CANCELLED", actor, { cancelReason: "Rescheduled" });
    const viewing = await tx.viewing.create({ data: { leadId: cancelled.leadId, requestedFor } });
    await tx.leadActivity.create({
      data: { leadId: cancelled.leadId, actorId: actor.id, type: "VIEWING_CHANGE", toStatus: "REQUESTED" },
    });
    return viewing;
  });
}
