import { InvalidTransitionError } from "@/lib/domain/errors";
import type { LeadStatus, UserRole } from "@/lib/generated/prisma/enums";

// Lead state machine (spec 0002). Agents move any lead; WON and LOST are terminal.

export const openLeadStatuses = ["NEW", "CONTACTED", "QUALIFIED"] as const satisfies LeadStatus[];

const moves: Record<LeadStatus, LeadStatus[]> = {
  NEW: ["CONTACTED", "QUALIFIED", "LOST"],
  CONTACTED: ["QUALIFIED", "LOST"],
  QUALIFIED: ["WON", "LOST"],
  WON: [],
  LOST: [],
};

export function assertLeadTransition(from: LeadStatus, to: LeadStatus, actor: { role: UserRole }) {
  if (actor.role !== "AGENT" || !moves[from].includes(to)) throw new InvalidTransitionError("lead", from, to);
}
