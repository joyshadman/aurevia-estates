import { InvalidTransitionError } from "@/lib/domain/errors";
import type { UserRole, ViewingStatus } from "@/lib/generated/prisma/enums";

// Viewing state machine (spec 0002). Agents make every move; a reschedule is a
// cancel plus a new viewing (see `rescheduleViewingIn`). A visitor may only
// cancel an active viewing (spec 0007, AC-9); ownership is checked by the writer.

export const activeViewingStatuses = ["REQUESTED", "CONFIRMED"] as const satisfies ViewingStatus[];

const moves: Record<ViewingStatus, ViewingStatus[]> = {
  REQUESTED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["CANCELLED", "COMPLETED", "NO_SHOW"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

const visitorMoves: Record<ViewingStatus, ViewingStatus[]> = {
  REQUESTED: ["CANCELLED"],
  CONFIRMED: ["CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function assertViewingTransition(from: ViewingStatus, to: ViewingStatus, actor: { role: UserRole }) {
  const allowed = actor.role === "AGENT" ? moves : actor.role === "VISITOR" ? visitorMoves : null;
  if (!allowed?.[from].includes(to)) throw new InvalidTransitionError("viewing", from, to);
}
