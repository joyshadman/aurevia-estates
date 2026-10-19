import "server-only";
import { assertViewingTransition } from "@/lib/domain/viewing-status";
import type { Prisma, ViewingStatus } from "@/lib/generated/prisma/client";
import { ForbiddenError, type Actor } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { NotFoundError, StaleStatusError } from "@/lib/server/errors";

// The only writer of `viewings.status` (spec 0002, AC-11). Every change writes a
// VIEWING_CHANGE activity on the lead in the same transaction.

export type ViewingExtra = { confirmedFor?: Date; cancelReason?: string };

// Runs inside a caller's transaction, so a reschedule can cancel and create in one.
export async function transitionViewingIn(
  tx: Prisma.TransactionClient,
  id: string,
  to: ViewingStatus,
  actor: Actor,
  extra: ViewingExtra = {},
) {
  const viewing = await tx.viewing.findUnique({ where: { id } });
  if (!viewing) throw new NotFoundError("viewing", id);
  assertViewingTransition(viewing.status, to, actor);
  // A visitor acts only on viewings of their own leads (spec 0007, AC-12).
  if (actor.role === "VISITOR") {
    const lead = await tx.lead.findUnique({ where: { id: viewing.leadId }, select: { visitorId: true } });
    if (lead?.visitorId !== actor.id) throw new ForbiddenError();
  }

  const data: Prisma.ViewingUpdateManyMutationInput = { status: to };
  if (to === "CONFIRMED") {
    if (!extra.confirmedFor) throw new TypeError("Confirming a viewing needs confirmedFor");
    data.confirmedFor = extra.confirmedFor;
  }
  const cancelReason = to === "CANCELLED" ? extra.cancelReason?.trim() || null : null;
  if (to === "CANCELLED") data.cancelReason = cancelReason;

  const { count } = await tx.viewing.updateMany({ where: { id, status: viewing.status }, data });
  if (count === 0) throw new StaleStatusError("viewing", id);

  await tx.leadActivity.create({
    data: {
      leadId: viewing.leadId,
      actorId: actor.id,
      type: "VIEWING_CHANGE",
      fromStatus: viewing.status,
      toStatus: to,
      body: cancelReason,
    },
  });
  return tx.viewing.findUniqueOrThrow({ where: { id } });
}

export async function transitionViewing(id: string, to: ViewingStatus, actor: Actor, extra?: ViewingExtra) {
  return db.$transaction((tx) => transitionViewingIn(tx, id, to, actor, extra));
}
