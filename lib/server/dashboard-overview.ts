import "server-only";
import type { LeadStatus, ViewingStatus } from "@/lib/generated/prisma/enums";
import type { AgentUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

// The agent's overview (spec 0022): their assigned leads only, the inbox's
// default "mine" view (spec 0009). Weeks are rolling 7 day windows ending now.

const dayMs = 24 * 60 * 60 * 1000;
const weeksShown = 8;
const upcomingShown = 5;
// The pipeline order: open first, then closed.
const pipelineOrder: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "WON", "LOST"];

export type Overview = {
  // Oldest first; the last entry is the 7 days ending now (AC-2).
  weeks: { start: string; end: string; count: number }[];
  pipeline: { status: LeadStatus; count: number }[];
  pipelineTotal: number;
  upcoming: {
    leadId: string;
    viewingId: string;
    start: string;
    status: ViewingStatus;
    visitor: string;
    refCode: string | null;
    title: string | null;
  }[];
};

export async function agentOverview(agent: AgentUser, now = new Date()): Promise<Overview> {
  const since = new Date(now.getTime() - weeksShown * 7 * dayMs);
  const monthAgo = new Date(now.getTime() - 30 * dayMs);

  const [recent, pipelineRows, upcomingRows] = await Promise.all([
    db.lead.findMany({ where: { assignedAgentId: agent.id, createdAt: { gt: since } }, select: { createdAt: true } }),
    // AC-3: current status of leads created in the last 30 days.
    db.lead.groupBy({ by: ["status"], where: { assignedAgentId: agent.id, createdAt: { gt: monthAgo } }, _count: { _all: true } }),
    // AC-4: start is `confirmed_for`, else `requested_for` (spec 0007).
    db.$queryRaw<
      { lead_id: string; viewing_id: string; start: Date; status: ViewingStatus; contact_name: string; ref_code: string | null; title: string | null }[]
    >`
      SELECT l.id AS lead_id, v.id AS viewing_id, coalesce(v.confirmed_for, v.requested_for) AS start, v.status,
             l.contact_name, li.ref_code, li.title
      FROM viewings v
      JOIN leads l ON l.id = v.lead_id
      LEFT JOIN listings li ON li.id = l.listing_id
      WHERE l.assigned_agent_id = ${agent.id}::uuid
        AND v.status IN ('REQUESTED', 'CONFIRMED')
        AND coalesce(v.confirmed_for, v.requested_for) > ${now}
      ORDER BY start
      LIMIT ${upcomingShown}`,
  ]);

  const weeks = Array.from({ length: weeksShown }, (_, index) => {
    const end = new Date(now.getTime() - (weeksShown - 1 - index) * 7 * dayMs);
    const start = new Date(end.getTime() - 7 * dayMs);
    const count = recent.filter((lead) => lead.createdAt > start && lead.createdAt <= end).length;
    return { start: start.toISOString(), end: end.toISOString(), count };
  });

  const counts = new Map(pipelineRows.map((row) => [row.status, row._count._all]));
  const pipeline = pipelineOrder.map((status) => ({ status, count: counts.get(status) ?? 0 }));

  return {
    weeks,
    pipeline,
    pipelineTotal: pipeline.reduce((sum, row) => sum + row.count, 0),
    upcoming: upcomingRows.map((row) => ({
      leadId: row.lead_id,
      viewingId: row.viewing_id,
      start: row.start.toISOString(),
      status: row.status,
      visitor: row.contact_name.trim() || "Unnamed visitor",
      refCode: row.ref_code,
      title: row.title,
    })),
  };
}
