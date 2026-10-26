import "server-only";
import type { AgentUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

// The success metric (spec 0018, AC-3): viewings booked through the assistant,
// counted from the database so it needs no consent and is exact. A viewing
// with `conversation_id` set came from a chat (spec 0007, *Value sourcing*);
// any status counts, including later cancels.
// Takes the agent so only a checked agent can read it.
export async function countAssistantBookings(_agent: AgentUser, days = 30, now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return db.viewing.count({ where: { conversationId: { not: null }, createdAt: { gte: since } } });
}
