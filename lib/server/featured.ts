import "server-only";
import type { AgentUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

// The Featured preview (spec 0023): the agent's published listings to pick
// from. Read only; featuring itself is not built until payments are designed.
export async function featurableListings(agent: AgentUser) {
  return db.listing.findMany({
    where: { status: "PUBLISHED", OR: [{ createdById: agent.id }, { assignedAgentId: agent.id }] },
    select: { id: true, title: true, refCode: true },
    orderBy: { updatedAt: "desc" },
  });
}
