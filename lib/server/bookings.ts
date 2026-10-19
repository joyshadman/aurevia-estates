import "server-only";
import { z } from "zod";
import type { Prisma } from "@/lib/generated/prisma/client";
import { ForbiddenError, type Actor } from "@/lib/server/auth";
import { ListingNotBookableError, StaleStatusError } from "@/lib/server/errors";
import { uuidv7 } from "@/lib/server/uuid";
import { transitionViewingIn } from "@/lib/server/viewing-status";

// Booking a viewing (spec 0002, AC-8, AC-9; reshaped by spec 0007). One open
// lead per visitor and listing, one active viewing per lead, both enforced by
// partial unique indexes and resolved with `on conflict do nothing`, so a double
// click is idempotent. Never catch P2002 inside a transaction: the conflict
// clauses make it unnecessary.

const openStatuses = ["NEW", "CONTACTED", "QUALIFIED"] as const;

export const bookingInput = z.object({
  listingId: z.uuid(),
  requestedFor: z.date(),
  name: z.string().trim().min(1).max(120),
  // E.164, e.g. +8801712345678.
  phone: z.string().trim().regex(/^\+[1-9][0-9]{7,14}$/, "Use the international form, like +8801712345678"),
  conversationId: z.uuid().optional(),
  note: z.string().trim().max(500).optional(),
  contactWhatsapp: z.boolean(),
});

export type BookingInput = z.input<typeof bookingInput>;

// Runs in the caller's transaction (spec 0007). The caller saves the profile;
// this copies the contact onto a new lead, or refreshes an open lead's copy
// (AC-7), and adds the notes of AC-6. Closed leads (WON, LOST) are never reused,
// so they never change.
export async function findOrCreateLeadAndViewing(tx: Prisma.TransactionClient, rawInput: BookingInput, actor: Actor) {
  if (actor.role !== "VISITOR") throw new ForbiddenError();
  const input = bookingInput.parse(rawInput);
  const note = input.note || null;

  const listing = await tx.listing.findUnique({ where: { id: input.listingId }, select: { status: true } });
  if (!listing || listing.status !== "PUBLISHED") throw new ListingNotBookableError(input.listingId);

  if (input.conversationId) {
    const owned = await tx.conversation.count({ where: { id: input.conversationId, userId: actor.id } });
    if (owned === 0) throw new ForbiddenError();
  }

  const inserted = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO leads (id, source, status, visitor_id, listing_id, conversation_id, assigned_agent_id,
                       contact_name, contact_phone, contact_email, contact_whatsapp, message, created_at, updated_at)
    VALUES (${uuidv7()}::uuid, 'CHAT_BOOKING', 'NEW', ${actor.id}::uuid, ${input.listingId}::uuid,
            ${input.conversationId ?? null}::uuid,
            (SELECT assigned_agent_id FROM listings WHERE id = ${input.listingId}::uuid),
            ${input.name}, ${input.phone},
            (SELECT email FROM profiles WHERE id = ${actor.id}::uuid), ${input.contactWhatsapp}, ${note}, now(), now())
    ON CONFLICT (visitor_id, listing_id)
      WHERE status IN ('NEW', 'CONTACTED', 'QUALIFIED') AND visitor_id IS NOT NULL AND listing_id IS NOT NULL
      DO NOTHING
    RETURNING id`;
  const leadReused = inserted.length === 0;

  let lead;
  if (!leadReused) {
    lead = await tx.lead.findUniqueOrThrow({ where: { id: inserted[0].id } });
    await tx.leadActivity.create({
      data: { leadId: lead.id, actorId: actor.id, type: "SYSTEM", body: "Lead created from a viewing booking" },
    });
  } else {
    const [open] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM leads
      WHERE visitor_id = ${actor.id}::uuid AND listing_id = ${input.listingId}::uuid
        AND status IN ('NEW', 'CONTACTED', 'QUALIFIED')
      FOR UPDATE`;
    if (!open) throw new StaleStatusError("lead", input.listingId);
    lead = await tx.lead.findUniqueOrThrow({ where: { id: open.id } });
    const notes: string[] = [];

    // AC-7: an open lead always carries the visitor's latest contact.
    if (lead.contactName !== input.name || lead.contactPhone !== input.phone || lead.contactWhatsapp !== input.contactWhatsapp) {
      lead = await tx.lead.update({
        where: { id: lead.id },
        data: { contactName: input.name, contactPhone: input.phone, contactWhatsapp: input.contactWhatsapp },
      });
      notes.push("Contact details updated by the visitor");
    }
    // AC-6: the note joins the lead's history; a second conversation is linked by a note.
    if (note) notes.push(note);
    if (input.conversationId && lead.conversationId && lead.conversationId !== input.conversationId) {
      notes.push("Booked again from another conversation");
    }
    for (const body of notes) {
      await tx.leadActivity.create({ data: { leadId: lead.id, actorId: actor.id, type: "NOTE", body } });
    }
  }

  // An active viewing is returned unchanged; changing its time is `rescheduleViewing`.
  const newViewing = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO viewings (id, lead_id, requested_for, status, created_at, updated_at)
    VALUES (${uuidv7()}::uuid, ${lead.id}::uuid, ${input.requestedFor}, 'REQUESTED', now(), now())
    ON CONFLICT (lead_id) WHERE status IN ('REQUESTED', 'CONFIRMED') DO NOTHING
    RETURNING id`;
  const viewingReused = newViewing.length === 0;
  const viewing = viewingReused
    ? await tx.viewing.findFirstOrThrow({ where: { leadId: lead.id, status: { in: ["REQUESTED", "CONFIRMED"] } } })
    : await tx.viewing.findUniqueOrThrow({ where: { id: newViewing[0].id } });

  if (!viewingReused) {
    await tx.leadActivity.create({
      data: { leadId: lead.id, actorId: actor.id, type: "VIEWING_CHANGE", toStatus: "REQUESTED" },
    });
  }

  return { lead, viewing, leadReused, viewingReused };
}

export const isOpenLead = (status: string) => (openStatuses as readonly string[]).includes(status);

// Cancels the active viewing and requests a new time on the same lead, in the
// caller's transaction (spec 0007). A concurrent change leaves no row to insert:
// `StaleStatusError`.
export async function rescheduleViewing(
  tx: Prisma.TransactionClient,
  viewingId: string,
  newStart: Date,
  actor: Actor,
  reason = "Rescheduled by visitor",
) {
  const cancelled = await transitionViewingIn(tx, viewingId, "CANCELLED", actor, { cancelReason: reason });
  const inserted = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO viewings (id, lead_id, requested_for, status, created_at, updated_at)
    VALUES (${uuidv7()}::uuid, ${cancelled.leadId}::uuid, ${newStart}, 'REQUESTED', now(), now())
    ON CONFLICT (lead_id) WHERE status IN ('REQUESTED', 'CONFIRMED') DO NOTHING
    RETURNING id`;
  if (inserted.length === 0) throw new StaleStatusError("viewing", viewingId);
  await tx.leadActivity.create({
    data: { leadId: cancelled.leadId, actorId: actor.id, type: "VIEWING_CHANGE", toStatus: "REQUESTED" },
  });
  return tx.viewing.findUniqueOrThrow({ where: { id: inserted[0].id } });
}
