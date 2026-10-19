import "server-only";
import { z } from "zod";
import { InvalidTransitionError } from "@/lib/domain/errors";
import { openLeadStatuses } from "@/lib/domain/lead-status";
import { isActiveViewing, viewingStart } from "@/lib/domain/viewing-slots";
import type { LeadStatus, Prisma } from "@/lib/generated/prisma/client";
import { ForbiddenError, type Actor } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { NotFoundError, StaleStatusError } from "@/lib/server/errors";
import { transitionLead } from "@/lib/server/lead-status";
import { transitionViewing } from "@/lib/server/viewing-status";

// The agent lead inbox (spec 0008, assumed; access rules from spec 0002: agents
// read and update every lead, the inbox defaults to "assigned to me", and a
// visitor's conversation is read only through its lead).

export type InboxReason = "not_found" | "stale_status" | "invalid" | "forbidden";
export type InboxFailure = { ok: false; reason: InboxReason; message?: string };

const fail = (reason: InboxReason, message?: string): InboxFailure => ({ ok: false, reason, ...(message ? { message } : {}) });
const isUuid = (value: unknown) => z.uuid().safeParse(value).success;
const pageSize = 25;

async function mapErrors<T>(work: () => Promise<T>): Promise<T | InboxFailure> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof NotFoundError) return fail("not_found");
    if (error instanceof StaleStatusError || error instanceof InvalidTransitionError) return fail("stale_status");
    if (error instanceof ForbiddenError) return fail("forbidden");
    throw error;
  }
}

const name = (p: { fullName: string | null; email: string | null } | null) =>
  p ? p.fullName?.trim() || p.email?.split("@")[0] || "An agent" : null;

// ---------------------------------------------------------------------------
// The table.

export const inboxTabs = ["open", "new", "all"] as const;
export type InboxTab = (typeof inboxTabs)[number];

const listCursor = z.object({ at: z.iso.datetime(), id: z.uuid() });

export async function listLeads(query: { tab?: InboxTab; mine?: boolean; cursor?: string }, actor: Actor) {
  if (actor.role !== "AGENT") throw new ForbiddenError();
  const and: Prisma.LeadWhereInput[] = [];
  const tab = query.tab ?? "open";
  if (tab === "open") and.push({ status: { in: [...openLeadStatuses] } });
  if (tab === "new") and.push({ status: "NEW" });
  if (query.mine ?? true) and.push({ assignedAgentId: actor.id });

  if (query.cursor) {
    try {
      const c = listCursor.parse(JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8")));
      and.push({ OR: [{ createdAt: { lt: new Date(c.at) } }, { createdAt: new Date(c.at), id: { lt: c.id } }] });
    } catch {
      // A bad cursor shows the first page.
    }
  }

  const rows = await db.lead.findMany({
    where: { AND: and },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
    include: {
      listing: { select: { title: true, refCode: true } },
      assignedAgent: { select: { fullName: true, email: true } },
      viewings: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
    },
  });
  const page = rows.slice(0, pageSize);
  const last = page.at(-1);
  return {
    rows: page.map((lead) => {
      const current = lead.viewings.find((v) => isActiveViewing(v.status)) ?? lead.viewings[0] ?? null;
      return {
        id: lead.id,
        contactName: lead.contactName,
        contactPhone: lead.contactPhone,
        contactWhatsapp: lead.contactWhatsapp === true,
        listing: lead.listing,
        viewing: current ? { start: viewingStart(current).toISOString(), status: current.status, confirmed: current.confirmedFor !== null } : null,
        source: lead.source,
        status: lead.status,
        advisor: name(lead.assignedAgent),
        createdAt: lead.createdAt.toISOString(),
      };
    }),
    nextCursor:
      rows.length > pageSize && last
        ? Buffer.from(JSON.stringify({ at: last.createdAt.toISOString(), id: last.id })).toString("base64url")
        : null,
  };
}

export type InboxRow = Awaited<ReturnType<typeof listLeads>>["rows"][number];

// ---------------------------------------------------------------------------
// One lead.

export async function getLeadDetail(id: string, actor: Actor) {
  if (actor.role !== "AGENT") throw new ForbiddenError();
  if (!isUuid(id)) return null;
  const lead = await db.lead.findUnique({
    where: { id },
    include: {
      listing: { select: { id: true, title: true, refCode: true, status: true } },
      assignedAgent: { select: { id: true, fullName: true, email: true } },
      viewings: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
      activities: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: { actor: { select: { fullName: true, email: true, role: true } } },
      },
    },
  });
  if (!lead) return null;
  const current = lead.viewings.find((v) => isActiveViewing(v.status)) ?? null;
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
    message: lead.message,
    anonymized: lead.anonymizedAt !== null,
    listing: lead.listing,
    advisor: lead.assignedAgent ? { id: lead.assignedAgent.id, name: name(lead.assignedAgent)! } : null,
    hasConversation: lead.conversationId !== null,
    createdAt: lead.createdAt.toISOString(),
    currentViewingId: current?.id ?? null,
    viewings: lead.viewings.map((v) => ({
      id: v.id,
      status: v.status,
      requestedFor: v.requestedFor.toISOString(),
      confirmedFor: v.confirmedFor?.toISOString() ?? null,
      cancelReason: v.cancelReason,
      createdAt: v.createdAt.toISOString(),
    })),
    activities: lead.activities.map((a) => ({
      id: a.id,
      type: a.type,
      body: a.body,
      fromStatus: a.fromStatus,
      toStatus: a.toStatus,
      createdAt: a.createdAt.toISOString(),
      actor: a.actor ? (a.actor.role === "VISITOR" ? "Visitor" : name(a.actor)) : "System",
    })),
  };
}

export type LeadDetail = NonNullable<Awaited<ReturnType<typeof getLeadDetail>>>;

// The linked conversation, read only, reached through the lead (spec 0002).
export async function leadConversation(leadId: string, actor: Actor) {
  if (actor.role !== "AGENT") throw new ForbiddenError();
  if (!isUuid(leadId)) return null;
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: {
      contactName: true,
      listing: { select: { refCode: true } },
      conversation: { select: { id: true, title: true, messages: { orderBy: { seq: "asc" } } } },
    },
  });
  if (!lead?.conversation) return null;
  const messages = lead.conversation.messages.map((m) => {
    const parts = m.parts as { type: string; text?: string; output?: { cards?: { refCode: string }[] }; data?: { cards?: { refCode: string }[] } }[];
    const shown = parts.flatMap((p) => {
      const cards = p.type === "tool-searchListings" ? p.output?.cards : p.type === "data-matches" ? p.data?.cards : undefined;
      return (cards ?? []).map((c) => c.refCode);
    });
    const booked = parts.some((p) => p.type === "data-viewing");
    return {
      id: m.id,
      role: m.role,
      text: m.textContent ?? "",
      shown,
      booked,
      createdAt: m.createdAt.toISOString(),
    };
  });
  return { contactName: lead.contactName, listingCode: lead.listing?.refCode ?? null, title: lead.conversation.title, messages };
}

// ---------------------------------------------------------------------------
// Actions.

const statusMoves = ["CONTACTED", "QUALIFIED", "WON", "LOST"] as const;

export async function changeLeadStatus(raw: { leadId: string; to: string; note?: string }, actor: Actor) {
  const parsed = z.object({ leadId: z.uuid(), to: z.enum(statusMoves), note: z.string().max(1000).optional() }).safeParse(raw);
  if (!parsed.success) return fail("invalid");
  return mapErrors(async () => {
    await transitionLead(parsed.data.leadId, parsed.data.to as LeadStatus, actor, parsed.data.note);
    return { ok: true as const };
  });
}

// A date and time typed in Sylhet (UTC+6 all year) to an instant.
function dhakaInstant(date: string, time: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const instant = new Date(Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]) - 6 * 3600_000);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

const viewingActionInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm"), viewingId: z.uuid(), date: z.string().optional(), time: z.string().optional() }),
  z.object({ action: z.literal("complete"), viewingId: z.uuid() }),
  z.object({ action: z.literal("no_show"), viewingId: z.uuid() }),
  z.object({ action: z.literal("cancel"), viewingId: z.uuid(), reason: z.string().max(200).optional() }),
]);

export async function changeViewing(raw: z.input<typeof viewingActionInput>, actor: Actor, now = new Date()) {
  const parsed = viewingActionInput.safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const input = parsed.data;
  return mapErrors(async () => {
    if (input.action === "confirm") {
      const viewing = await db.viewing.findUnique({ where: { id: input.viewingId } });
      if (!viewing) return fail("not_found");
      // At the requested time, or another time the agent agreed with the visitor.
      const confirmedFor = input.date || input.time ? dhakaInstant(input.date ?? "", input.time ?? "") : viewing.requestedFor;
      if (!confirmedFor) return fail("invalid", "Enter a date and a time.");
      if (confirmedFor <= now) return fail("invalid", "Pick a time in the future.");
      await transitionViewing(input.viewingId, "CONFIRMED", actor, { confirmedFor });
    } else if (input.action === "complete") {
      await transitionViewing(input.viewingId, "COMPLETED", actor);
    } else if (input.action === "no_show") {
      await transitionViewing(input.viewingId, "NO_SHOW", actor);
    } else {
      await transitionViewing(input.viewingId, "CANCELLED", actor, { cancelReason: input.reason?.trim() || "Cancelled by the agency" });
    }
    return { ok: true as const };
  });
}

export async function addLeadNote(raw: { leadId: string; body: string }, actor: Actor) {
  if (actor.role !== "AGENT") return fail("forbidden");
  const parsed = z.object({ leadId: z.uuid(), body: z.string().trim().min(1).max(1000) }).safeParse(raw);
  if (!parsed.success) return fail("invalid", "Write 1 to 1,000 characters.");
  const exists = await db.lead.count({ where: { id: parsed.data.leadId } });
  if (exists === 0) return fail("not_found");
  await db.leadActivity.create({ data: { leadId: parsed.data.leadId, actorId: actor.id, type: "NOTE", body: parsed.data.body } });
  return { ok: true as const };
}

// Only an unassigned lead (a general contact form) can be taken.
export async function takeLead(raw: { leadId: string }, actor: Actor) {
  if (actor.role !== "AGENT") return fail("forbidden");
  if (!isUuid(raw.leadId)) return fail("not_found");
  return db.$transaction(async (tx) => {
    const { count } = await tx.lead.updateMany({ where: { id: raw.leadId, assignedAgentId: null }, data: { assignedAgentId: actor.id } });
    if (count === 0) return fail("stale_status");
    await tx.leadActivity.create({ data: { leadId: raw.leadId, actorId: actor.id, type: "SYSTEM", body: "Taken by an agent from the shared inbox" } });
    return { ok: true as const };
  });
}
