import "server-only";
import { normalizeBanglaDigits } from "@/lib/domain/bangla";
import { displayName } from "@/lib/domain/display-name";
import { InvalidTransitionError } from "@/lib/domain/errors";
import { isOpenLead, leadMoves } from "@/lib/domain/lead-status";
import { normalizeRefCode } from "@/lib/domain/listing-card";
import { agentViewingDates, dhakaInstant, isActiveViewing, viewingStart } from "@/lib/domain/viewing-slots";
import {
  Prisma,
  type LeadSource,
  type LeadStatus,
  type ListingStatus,
  type MessageRole,
  type ViewingStatus,
} from "@/lib/generated/prisma/client";
import { listActiveAgents } from "@/lib/server/agent-listings";
import type { AgentUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { NotFoundError, StaleStatusError } from "@/lib/server/errors";
import { transitionLeadIn } from "@/lib/server/lead-status";
import type { ViewingState } from "@/lib/server/viewing-cards";
import { changeConfirmedTimeIn, transitionViewingIn } from "@/lib/server/viewing-status";

// The agent lead inbox (spec 0009). Reads for `/dashboard/leads` and the lead
// page, and every agent write on a lead or its viewings. Each write runs in one
// transaction that first locks the lead row, the lock visitor change and cancel
// take too (spec 0007), so a stale page never overwrites a newer change (AC-15).

const removedUser = "Removed user";
const unassigned = "Unassigned";

const stateOf = (viewing: { status: ViewingStatus; start: Date }, now: Date): ViewingState =>
  isActiveViewing(viewing.status) && viewing.start <= now ? "AWAITING_UPDATE" : viewing.status;

// ---------------------------------------------------------------------------
// The inbox table (AC-1 to AC-4).

export const inboxTabs = ["action", "upcoming", "open", "closed"] as const;
export type InboxTab = (typeof inboxTabs)[number];

export const inboxPageSize = 25;
const maxPage = 400;

export type InboxQuery = { tab: InboxTab; q: string; mine: boolean; page: number };

export type InboxRow = {
  id: string;
  contactName: string;
  contactPhone: string | null;
  contactWhatsapp: boolean;
  listing: { title: string; refCode: string } | null;
  viewing: { start: string; state: ViewingState } | null;
  status: LeadStatus;
  advisor: string;
  receivedAt: string;
};

// Bad params fall back to the defaults (spec 0009, `listInbox`).
export function parseInboxQuery(params: Record<string, string | string[] | undefined>): InboxQuery {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const tab = first(params.tab);
  const page = Number(first(params.page));
  return {
    tab: inboxTabs.includes(tab as InboxTab) ? (tab as InboxTab) : "action",
    q: (first(params.q) ?? "").trim().slice(0, 120),
    mine: first(params.mine) !== "0",
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, maxPage) : 1,
  };
}

const openSql = Prisma.sql`l.status IN ('NEW', 'CONTACTED', 'QUALIFIED')`;

// AC-1. `v` is the lead's active viewing, at most one (spec 0002's partial unique index).
const tabSql: Record<InboxTab, Prisma.Sql> = {
  action: Prisma.sql`${openSql} AND (l.status = 'NEW' OR v.status = 'REQUESTED' OR v.start <= now())`,
  upcoming: Prisma.sql`l.status IN ('CONTACTED', 'QUALIFIED') AND v.status = 'CONFIRMED' AND v.start > now()`,
  open: openSql,
  closed: Prisma.sql`l.status IN ('WON', 'LOST')`,
};

const fromSql = Prisma.sql`
  FROM leads l
  LEFT JOIN listings li ON li.id = l.listing_id
  LEFT JOIN LATERAL (
    SELECT vv.status::text AS status, coalesce(vv.confirmed_for, vv.requested_for) AS start
    FROM viewings vv
    WHERE vv.lead_id = l.id AND vv.status IN ('REQUESTED', 'CONFIRMED')
    LIMIT 1
  ) v ON true`;

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (char) => `\\${char}`);

// AC-2 (Mine only) and AC-4 (search), shared by the rows and the counts.
function filterSql(agentId: string, query: InboxQuery): Prisma.Sql {
  const and: Prisma.Sql[] = [Prisma.sql`true`];
  if (query.mine) and.push(Prisma.sql`(l.assigned_agent_id = ${agentId}::uuid OR l.assigned_agent_id IS NULL)`);
  if (query.q) {
    const or = [Prisma.sql`l.contact_name ILIKE ${`%${escapeLike(query.q)}%`}`];
    const digits = normalizeBanglaDigits(query.q).replace(/\D/g, "");
    if (digits.length >= 4) {
      or.push(Prisma.sql`regexp_replace(coalesce(l.contact_phone, ''), ${"\\D"}, '', 'g') LIKE ${`%${digits}%`}`);
    }
    or.push(Prisma.sql`li.ref_code = ${normalizeRefCode(query.q)}`);
    and.push(Prisma.sql`(${Prisma.join(or, " OR ")})`);
  }
  return Prisma.join(and, " AND ");
}

type InboxSqlRow = {
  id: string;
  status: LeadStatus;
  contact_name: string;
  contact_phone: string | null;
  contact_whatsapp: boolean | null;
  created_at: Date;
  title: string | null;
  ref_code: string | null;
  agent_name: string | null;
  agent_email: string | null;
  v_status: ViewingStatus | null;
  v_start: Date | null;
};

export async function listInbox(
  agentId: string,
  query: InboxQuery,
): Promise<{ rows: InboxRow[]; counts: Record<InboxTab, number>; hasNext: boolean }> {
  const filters = filterSql(agentId, query);
  const rows = await db.$queryRaw<InboxSqlRow[]>`
    SELECT l.id, l.status::text AS status, l.contact_name, l.contact_phone, l.contact_whatsapp, l.created_at,
           li.title, li.ref_code, p.full_name AS agent_name, p.email AS agent_email,
           v.status AS v_status, v.start AS v_start
    ${fromSql}
    LEFT JOIN profiles p ON p.id = l.assigned_agent_id
    WHERE ${filters} AND ${tabSql[query.tab]}
    ORDER BY v.start ASC NULLS LAST, l.created_at DESC, l.id DESC
    LIMIT ${inboxPageSize + 1} OFFSET ${(query.page - 1) * inboxPageSize}`;
  const [counts] = await db.$queryRaw<Record<InboxTab, number>[]>`
    SELECT count(*) FILTER (WHERE ${tabSql.action})::int AS action,
           count(*) FILTER (WHERE ${tabSql.upcoming})::int AS upcoming,
           count(*) FILTER (WHERE ${tabSql.open})::int AS open,
           count(*) FILTER (WHERE ${tabSql.closed})::int AS closed
    ${fromSql}
    WHERE ${filters}`;

  const now = new Date();
  return {
    rows: rows.slice(0, inboxPageSize).map((row) => ({
      id: row.id,
      contactName: row.contact_name,
      contactPhone: row.contact_phone,
      contactWhatsapp: row.contact_whatsapp === true,
      listing: row.title !== null && row.ref_code !== null ? { title: row.title, refCode: row.ref_code } : null,
      viewing:
        row.v_status && row.v_start
          ? { start: row.v_start.toISOString(), state: stateOf({ status: row.v_status, start: row.v_start }, now) }
          : null,
      status: row.status,
      advisor: row.agent_email !== null ? displayName({ fullName: row.agent_name ?? "", email: row.agent_email }) : unassigned,
      receivedAt: row.created_at.toISOString(),
    })),
    counts,
    hasNext: rows.length > inboxPageSize,
  };
}

// ---------------------------------------------------------------------------
// The lead page (AC-5, AC-14).

export type LeadViewing = {
  id: string;
  status: ViewingStatus;
  state: ViewingState;
  start: string;
  requestedFor: string;
  confirmedFor: string | null;
  cancelReason: string | null;
  // The stale check token: the viewing's `updated_at` (AC-15).
  version: string;
};

export type ViewingActions = {
  confirmRequested: boolean;
  confirmOther: boolean;
  changeTime: boolean;
  cancel: boolean;
  close: boolean;
};

export type LeadActivityEntry = {
  id: string;
  type: "NOTE" | "STATUS_CHANGE" | "VIEWING_CHANGE" | "SYSTEM";
  actorName: string;
  fromStatus: string | null;
  toStatus: string | null;
  body: string | null;
  at: string;
};

export type LeadDetail = {
  id: string;
  status: LeadStatus;
  source: LeadSource;
  contact: { name: string; phone: string | null; email: string | null; whatsapp: boolean };
  receivedAt: string;
  listing: { id: string; title: string; refCode: string; status: ListingStatus } | null;
  advisor: { id: string; name: string } | null;
  current: (LeadViewing & { actions: ViewingActions }) | null;
  earlier: LeadViewing[];
  activities: LeadActivityEntry[];
  moves: LeadStatus[];
  agents: { id: string; fullName: string }[];
  transcript: Transcript | null;
};

const activitiesShown = 200;

function toLeadViewing(
  viewing: { id: string; status: ViewingStatus; requestedFor: Date; confirmedFor: Date | null; cancelReason: string | null; updatedAt: Date },
  now: Date,
): LeadViewing {
  const start = viewingStart(viewing);
  return {
    id: viewing.id,
    status: viewing.status,
    state: stateOf({ status: viewing.status, start }, now),
    start: start.toISOString(),
    requestedFor: viewing.requestedFor.toISOString(),
    confirmedFor: viewing.confirmedFor?.toISOString() ?? null,
    cancelReason: viewing.cancelReason,
    version: viewing.updatedAt.toISOString(),
  };
}

// Which viewing actions the page shows (AC-6 to AC-10); the server checks each again.
function viewingActions(viewing: LeadViewing, leadOpen: boolean, now: Date): ViewingActions {
  const requested = viewing.status === "REQUESTED";
  const confirmed = viewing.status === "CONFIRMED";
  return {
    confirmRequested: requested && leadOpen && new Date(viewing.requestedFor) > now,
    confirmOther: requested && leadOpen,
    changeTime: confirmed && leadOpen,
    cancel: requested || confirmed,
    close: confirmed && viewing.confirmedFor !== null && new Date(viewing.confirmedFor) <= now,
  };
}

export async function getLeadDetail(leadId: string): Promise<LeadDetail | null> {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    include: {
      listing: { select: { id: true, title: true, refCode: true, status: true } },
      assignedAgent: { select: { id: true, fullName: true, email: true } },
      viewings: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
      activities: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: activitiesShown,
        include: { actor: { select: { fullName: true, email: true } } },
      },
    },
  });
  if (!lead) return null;

  const now = new Date();
  const leadOpen = isOpenLead(lead.status);
  const active = lead.viewings.find((viewing) => isActiveViewing(viewing.status));
  const current = active ? toLeadViewing(active, now) : null;
  const [agents, transcript] = await Promise.all([listActiveAgents(), transcriptFor(lead)]);

  return {
    id: lead.id,
    status: lead.status,
    source: lead.source,
    contact: {
      name: lead.contactName,
      phone: lead.contactPhone,
      email: lead.contactEmail,
      whatsapp: lead.contactWhatsapp === true,
    },
    receivedAt: lead.createdAt.toISOString(),
    listing: lead.listing,
    advisor: lead.assignedAgent ? { id: lead.assignedAgent.id, name: displayName(lead.assignedAgent) } : null,
    current: current ? { ...current, actions: viewingActions(current, leadOpen, now) } : null,
    earlier: lead.viewings.filter((viewing) => viewing !== active).map((viewing) => toLeadViewing(viewing, now)),
    activities: lead.activities.map((activity) => ({
      id: activity.id,
      type: activity.type,
      actorName: activity.actor ? displayName(activity.actor) : removedUser,
      fromStatus: activity.fromStatus,
      toStatus: activity.toStatus,
      body: activity.body,
      at: activity.createdAt.toISOString(),
    })),
    moves: [...leadMoves(lead.status)],
    agents,
    transcript,
  };
}

// ---------------------------------------------------------------------------
// The transcript (AC-14): read only, 30 messages at a time, through the lead's
// `conversation_id` only (an agent never passes a conversation id).

export const transcriptPageSize = 30;

export type TranscriptLine = { kind: "text" | "card"; text: string };
export type TranscriptMessage = { id: string; seq: number; role: MessageRole; lines: TranscriptLine[] };

export type Transcript =
  | { deleted: true }
  | { deleted: false; messages: TranscriptMessage[]; earliestSeq: number | null; hasEarlier: boolean };

type StoredPart = { type: string } & Record<string, unknown>;

const cardCodes = (value: unknown) =>
  ((value as { cards?: { refCode?: unknown }[] } | undefined)?.cards ?? [])
    .map((card) => card.refCode)
    .filter((code): code is string => typeof code === "string");

// Cards become one line each; the brief and reasoning are left out.
function transcriptLine(part: StoredPart): TranscriptLine | null {
  if (part.type === "text") return typeof part.text === "string" && part.text.trim() ? { kind: "text", text: part.text } : null;
  if (part.type === "data-matches" || (part.type === "tool-searchListings" && part.state === "output-available")) {
    const codes = cardCodes(part.type === "data-matches" ? part.data : part.output);
    return { kind: "card", text: codes.length > 0 ? `Showed homes: ${codes.join(", ")}` : "Searched, no homes found" };
  }
  if (part.type === "tool-getListingDetails" && part.state === "output-available") {
    const code = (part.input as { refCode?: unknown } | undefined)?.refCode;
    return typeof code === "string" ? { kind: "card", text: `Looked up ${normalizeRefCode(code)}` } : null;
  }
  if (part.type === "tool-offerViewing" && part.state === "output-available") {
    const output = part.output as { refCode?: unknown; error?: unknown } | undefined;
    return output && !output.error && typeof output.refCode === "string"
      ? { kind: "card", text: `Showed a booking card for ${output.refCode}` }
      : null;
  }
  if (part.type === "data-viewing") return { kind: "card", text: "Viewing requested" };
  return null;
}

async function transcriptPage(conversationId: string, beforeSeq?: number): Promise<Transcript> {
  const rows = await db.chatMessage.findMany({
    where: { conversationId, ...(beforeSeq !== undefined ? { seq: { lt: BigInt(beforeSeq) } } : {}) },
    orderBy: { seq: "desc" },
    take: transcriptPageSize + 1,
    select: { id: true, seq: true, role: true, parts: true },
  });
  const page = rows.slice(0, transcriptPageSize).reverse();
  return {
    deleted: false,
    messages: page.map((row) => ({
      id: row.id,
      seq: Number(row.seq),
      role: row.role,
      lines: ((row.parts as StoredPart[]) ?? []).map(transcriptLine).filter((line): line is TranscriptLine => line !== null),
    })),
    earliestSeq: page.length > 0 ? Number(page[0].seq) : null,
    hasEarlier: rows.length > transcriptPageSize,
  };
}

// Null when the lead never had a chat. A chat booking with no conversation
// means the visitor deleted it.
async function transcriptFor(lead: { conversationId: string | null; source: LeadSource }, beforeSeq?: number) {
  if (lead.conversationId) return transcriptPage(lead.conversationId, beforeSeq);
  return lead.source === "CHAT_BOOKING" ? ({ deleted: true } as const) : null;
}

export async function loadTranscript(leadId: string, beforeSeq?: number): Promise<Transcript | null> {
  const lead = await db.lead.findUnique({ where: { id: leadId }, select: { conversationId: true, source: true } });
  if (!lead) throw new NotFoundError("lead", leadId);
  return transcriptFor(lead, beforeSeq);
}

// ---------------------------------------------------------------------------
// Writes (AC-6 to AC-13, AC-15).

export type InboxReason =
  | "not_found"
  | "stale_status"
  | "lead_closed"
  | "time_in_past"
  | "unchanged"
  | "too_early"
  | "invalid_move"
  | "invalid"
  | "not_an_agent";

export type InboxResult = { ok: true; leadId: string } | { ok: false; reason: InboxReason };

// Rolls the transaction back and becomes a failure result.
class InboxAbort extends Error {
  constructor(readonly reason: InboxReason) {
    super(reason);
  }
}

// A declaration, so a call narrows the types after it.
function abort(reason: InboxReason): never {
  throw new InboxAbort(reason);
}

async function run(work: (tx: Prisma.TransactionClient) => Promise<string>): Promise<InboxResult> {
  try {
    return { ok: true, leadId: await db.$transaction(work) };
  } catch (error) {
    if (error instanceof InboxAbort) return { ok: false, reason: error.reason };
    if (error instanceof NotFoundError) return { ok: false, reason: "not_found" };
    // The guarded writes found the row moved on under the lock.
    if (error instanceof StaleStatusError || error instanceof InvalidTransitionError) return { ok: false, reason: "stale_status" };
    throw error;
  }
}

type LockedLead = { id: string; status: LeadStatus; assigned_agent_id: string | null };

async function lockLead(tx: Prisma.TransactionClient, leadId: string): Promise<LockedLead> {
  const [lead] = await tx.$queryRaw<LockedLead[]>`
    SELECT id, status::text AS status, assigned_agent_id FROM leads WHERE id = ${leadId}::uuid FOR UPDATE`;
  return lead ?? abort("not_found");
}

// Locks the viewing's lead, then rereads the viewing under the lock and checks
// the page's `version` and the statuses this action allows (AC-15).
async function lockViewing(tx: Prisma.TransactionClient, viewingId: string, version: Date, allowed: readonly ViewingStatus[]) {
  const [lead] = await tx.$queryRaw<LockedLead[]>`
    SELECT id, status::text AS status, assigned_agent_id FROM leads
    WHERE id = (SELECT lead_id FROM viewings WHERE id = ${viewingId}::uuid)
    FOR UPDATE`;
  if (!lead) abort("not_found");
  const viewing = await tx.viewing.findUniqueOrThrow({ where: { id: viewingId } });
  if (viewing.updatedAt.getTime() !== version.getTime() || !allowed.includes(viewing.status)) abort("stale_status");
  return { lead, viewing };
}

export type AgentTime = { date: string; time: string };

// AC-6: a Dhaka date from today to 30 days ahead, and a time in the future.
function agreedTime(at: AgentTime, now: Date): Date {
  if (!agentViewingDates(now).includes(at.date)) abort("invalid");
  const instant = dhakaInstant(at.date, at.time);
  if (instant <= now) abort("time_in_past");
  return instant;
}

export async function confirmViewing(
  agent: AgentUser,
  input: { viewingId: string; version: Date; at?: AgentTime },
): Promise<InboxResult> {
  return run(async (tx) => {
    const now = new Date();
    const { lead, viewing } = await lockViewing(tx, input.viewingId, input.version, ["REQUESTED"]);
    if (!isOpenLead(lead.status)) abort("lead_closed");
    const confirmedFor = input.at ? agreedTime(input.at, now) : viewing.requestedFor;
    if (confirmedFor <= now) abort("time_in_past");
    await transitionViewingIn(tx, viewing.id, "CONFIRMED", agent, { confirmedFor });
    // AC-6: confirming moves a NEW lead to CONTACTED in the same transaction.
    if (lead.status === "NEW") await transitionLeadIn(tx, lead.id, "CONTACTED", agent);
    return lead.id;
  });
}

export async function changeViewingTimeAsAgent(
  agent: AgentUser,
  input: { viewingId: string; version: Date; at: AgentTime },
): Promise<InboxResult> {
  return run(async (tx) => {
    const now = new Date();
    const { lead, viewing } = await lockViewing(tx, input.viewingId, input.version, ["CONFIRMED"]);
    if (!isOpenLead(lead.status)) abort("lead_closed");
    const confirmedFor = agreedTime(input.at, now);
    if (viewing.confirmedFor?.getTime() === confirmedFor.getTime()) abort("unchanged");
    await changeConfirmedTimeIn(tx, viewing.id, confirmedFor, agent);
    return lead.id;
  });
}

// AC-8: at any time, on any lead, with a reason.
export async function cancelViewingAsAgent(
  agent: AgentUser,
  input: { viewingId: string; version: Date; reason: string },
): Promise<InboxResult> {
  return run(async (tx) => {
    const reason = input.reason.trim();
    if (!reason || reason.length > 200) abort("invalid");
    const { lead, viewing } = await lockViewing(tx, input.viewingId, input.version, ["REQUESTED", "CONFIRMED"]);
    await transitionViewingIn(tx, viewing.id, "CANCELLED", agent, { cancelReason: reason });
    return lead.id;
  });
}

// AC-9: only once the confirmed time has passed, on any lead.
export async function closeViewing(
  agent: AgentUser,
  input: { viewingId: string; version: Date; outcome: "COMPLETED" | "NO_SHOW" },
): Promise<InboxResult> {
  return run(async (tx) => {
    const { lead, viewing } = await lockViewing(tx, input.viewingId, input.version, ["CONFIRMED"]);
    if (!viewing.confirmedFor || viewing.confirmedFor > new Date()) abort("too_early");
    await transitionViewingIn(tx, viewing.id, input.outcome, agent);
    return lead.id;
  });
}

// AC-11: one move from the status the page showed. Lost carries its reason.
export async function moveLead(
  agent: AgentUser,
  input: { leadId: string; from: LeadStatus; to: LeadStatus; reason?: string },
): Promise<InboxResult> {
  return run(async (tx) => {
    const lead = await lockLead(tx, input.leadId);
    if (lead.status !== input.from) abort("stale_status");
    if (!leadMoves(lead.status).includes(input.to)) abort("invalid_move");
    const reason = input.reason?.trim() ?? "";
    if (input.to === "LOST" && (!reason || reason.length > 200)) abort("invalid");
    await transitionLeadIn(tx, lead.id, input.to, agent, input.to === "LOST" ? reason : undefined);
    return lead.id;
  });
}

// AC-12: notes only add, so they carry no stale check.
export async function addLeadNote(agent: AgentUser, input: { leadId: string; body: string }): Promise<InboxResult> {
  return run(async (tx) => {
    const body = input.body.trim();
    if (!body || body.length > 2000) abort("invalid");
    const lead = await lockLead(tx, input.leadId);
    await tx.leadActivity.create({ data: { leadId: lead.id, actorId: agent.id, type: "NOTE", body } });
    return lead.id;
  });
}

// AC-13: open leads only; `from` is the advisor the page showed.
export async function assignLead(
  agent: AgentUser,
  input: { leadId: string; from: string | null; agentId: string },
): Promise<InboxResult> {
  return run(async (tx) => {
    const lead = await lockLead(tx, input.leadId);
    if (!isOpenLead(lead.status)) abort("lead_closed");
    if (lead.assigned_agent_id !== input.from) abort("stale_status");
    const target = await tx.profile.findFirst({
      where: { id: input.agentId, role: "AGENT", deletedAt: null },
      select: { fullName: true, email: true },
    });
    if (!target) abort("not_an_agent");
    if (lead.assigned_agent_id === input.agentId) return lead.id;

    const previous = lead.assigned_agent_id
      ? await tx.profile.findUnique({ where: { id: lead.assigned_agent_id }, select: { fullName: true, email: true } })
      : null;
    await tx.lead.update({ where: { id: lead.id }, data: { assignedAgentId: input.agentId } });
    await tx.leadActivity.create({
      data: {
        leadId: lead.id,
        actorId: agent.id,
        type: "SYSTEM",
        body: `Advisor changed from ${previous ? displayName(previous) : unassigned} to ${displayName(target)}`,
      },
    });
    return lead.id;
  });
}
