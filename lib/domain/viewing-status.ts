import { InvalidTransitionError } from "@/lib/domain/errors";
import type { UserRole, ViewingStatus } from "@/lib/generated/prisma/enums";

// Viewing state machine (spec 0002). Agents make every move; a visitor may only
// cancel an active viewing on their own lead (spec 0007, checked by the server).
// A reschedule is a cancel plus a new viewing (see `rescheduleViewing`).

export const activeViewingStatuses = ["REQUESTED", "CONFIRMED"] as const satisfies ViewingStatus[];

const moves: Record<ViewingStatus, ViewingStatus[]> = {
  REQUESTED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["CANCELLED", "COMPLETED", "NO_SHOW"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function assertViewingTransition(from: ViewingStatus, to: ViewingStatus, actor: { role: UserRole }) {
  const allowed =
    moves[from].includes(to) && (actor.role === "AGENT" || (actor.role === "VISITOR" && to === "CANCELLED"));
  if (!allowed) throw new InvalidTransitionError("viewing", from, to);
}
