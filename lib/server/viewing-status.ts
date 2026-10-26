import "server-only";
import { InvalidTransitionError } from "@/lib/domain/errors";
import { formatViewingTime } from "@/lib/domain/viewing-slots";
import { assertViewingTransition } from "@/lib/domain/viewing-status";
import type { Prisma, ViewingStatus } from "@/lib/generated/prisma/client";
import type { Actor } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { NotFoundError, StaleStatusError } from "@/lib/server/errors";
import { queueViewingConfirmedIn } from "@/lib/server/notify";

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
  const viewing = await tx.viewing.findUnique({
    where: { id },
    include: { lead: { select: { visitorId: true } } },
  });
  // A visitor moves only viewings on their own leads (spec 0007, AC-12).
  if (!viewing || (actor.role === "VISITOR" && viewing.lead.visitorId !== actor.id)) throw new NotFoundError("viewing", id);
  assertViewingTransition(viewing.status, to, actor);

  const data: Prisma.ViewingUpdateManyMutationInput = { status: to };
  // Spec 0009, *Writers*: a confirm says the time, a cancel its reason, a close nothing.
  let body: string | null = null;
  if (to === "CONFIRMED") {
    if (!extra.confirmedFor) throw new TypeError("Confirming a viewing needs confirmedFor");
    data.confirmedFor = extra.confirmedFor;
    body = `Confirmed for ${formatViewingTime(extra.confirmedFor)} Sylhet`;
  }
  if (to === "CANCELLED") {
    body = extra.cancelReason?.trim() || null;
    data.cancelReason = body;
  }

  const { count } = await tx.viewing.updateMany({ where: { id, status: viewing.status }, data });
  if (count === 0) throw new StaleStatusError("viewing", id);

  await tx.leadActivity.create({
    data: {
      leadId: viewing.leadId,
      actorId: actor.id,
      type: "VIEWING_CHANGE",
      fromStatus: viewing.status,
      toStatus: to,
      body,
    },
  });
  // Spec 0019, AC-2: the visitor hears about a confirm.
  if (to === "CONFIRMED") await queueViewingConfirmedIn(tx, id);
  return tx.viewing.findUniqueOrThrow({ where: { id } });
}

// An agent moves a CONFIRMED viewing to the new time agreed with the buyer
// (spec 0009, AC-7). A time change, not a status change.
export async function changeConfirmedTimeIn(tx: Prisma.TransactionClient, id: string, confirmedFor: Date, actor: Actor) {
  if (actor.role !== "AGENT") throw new InvalidTransitionError("viewing", "CONFIRMED", "CONFIRMED");
  const viewing = await tx.viewing.findUnique({ where: { id }, select: { leadId: true } });
  if (!viewing) throw new NotFoundError("viewing", id);

  const { count } = await tx.viewing.updateMany({ where: { id, status: "CONFIRMED" }, data: { confirmedFor } });
  if (count === 0) throw new StaleStatusError("viewing", id);

  await tx.leadActivity.create({
    data: {
      leadId: viewing.leadId,
      actorId: actor.id,
      type: "VIEWING_CHANGE",
      fromStatus: "CONFIRMED",
      toStatus: "CONFIRMED",
      body: `Time changed to ${formatViewingTime(confirmedFor)} Sylhet`,
    },
  });
  return tx.viewing.findUniqueOrThrow({ where: { id } });
}

export async function transitionViewing(id: string, to: ViewingStatus, actor: Actor, extra?: ViewingExtra) {
  return db.$transaction((tx) => transitionViewingIn(tx, id, to, actor, extra));
}
