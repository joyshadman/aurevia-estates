import "server-only";
import { assertLeadTransition } from "@/lib/domain/lead-status";
import type { LeadStatus, Prisma } from "@/lib/generated/prisma/client";
import type { Actor } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { NotFoundError, StaleStatusError } from "@/lib/server/errors";

// The only writer of `leads.status` (spec 0002, AC-11). Every change writes a
// `lead_activities` row in the same transaction.

export async function transitionLead(id: string, to: LeadStatus, actor: Actor, note?: string) {
  return db.$transaction(async (tx) => {
    const lead = await tx.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundError("lead", id);
    assertLeadTransition(lead.status, to, actor);

    const data: Prisma.LeadUpdateManyMutationInput = { status: to };
    if (lead.status === "NEW" && !lead.contactedAt) data.contactedAt = new Date();

    const { count } = await tx.lead.updateMany({ where: { id, status: lead.status }, data });
    if (count === 0) throw new StaleStatusError("lead", id);

    await tx.leadActivity.create({
      data: {
        leadId: id,
        actorId: actor.id,
        type: "STATUS_CHANGE",
        fromStatus: lead.status,
        toStatus: to,
        body: note?.trim() || null,
      },
    });
    return tx.lead.findUniqueOrThrow({ where: { id } });
  });
}
