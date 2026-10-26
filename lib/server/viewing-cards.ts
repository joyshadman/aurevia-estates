import "server-only";
import {
  availableSlots,
  canVisitorChange,
  isActiveViewing,
  VISITOR_RESCHEDULE_REASON,
  viewingStart,
  type ViewingSlot,
} from "@/lib/domain/viewing-slots";
import { splitPhone } from "@/lib/domain/phone-countries";
import type { Prisma, ViewingStatus } from "@/lib/generated/prisma/client";
import type { Actor } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import type { ExistingViewing } from "@/lib/server/errors";

// What the booking card, the confirmation card, the account list, and the
// model's booking notes read (spec 0007, *Actions and reads*, *Cards and
// history*). Always current data, never the moment of booking (AC-8).

const fallbackAdvisor = "an Aurevia advisor";
const openLeadStatuses = ["NEW", "CONTACTED", "QUALIFIED"] as const;
const maxLeadsPerLoad = 300;
const recentViewingsShown = 5;

type AgentRow = { fullName: string; agentIsPublic: boolean; deletedAt: Date | null } | null;

// *Value sourcing*: the agent's name when public, else "an Aurevia advisor"
// (also when unassigned or deleted).
export function advisorName(agent: AgentRow): string {
  if (!agent || !agent.agentIsPublic || agent.deletedAt !== null) return fallbackAdvisor;
  return agent.fullName.trim() || fallbackAdvisor;
}

const agentSelect = { select: { fullName: true, agentIsPublic: true, deletedAt: true } } as const;

// ---------------------------------------------------------------------------
// The booking card (AC-2, AC-3, AC-6).

export type BookingCardData = {
  listingId: string;
  title: string;
  areaName: string;
  refCode: string;
  listingAvailable: boolean;
  slots: ViewingSlot[];
  // The saved E.164 phone split for the form; Bangladesh when none (AC-2).
  prefill: { name: string; countryCode: string; national: string; whatsapp: boolean };
  existing: ExistingViewing | null;
  advisorName: string;
};

// The conversation must be the user's; an unpublished listing is returned so
// the card can say it can't be booked.
export async function bookingCardData(
  actor: Actor,
  conversationId: string,
  listingIds: string[],
): Promise<{ ok: true; cards: Record<string, BookingCardData> } | { ok: false; reason: "not_found" | "not_visitor" }> {
  const conversation = await db.conversation.findFirst({ where: { id: conversationId, userId: actor.id }, select: { id: true } });
  if (!conversation) return { ok: false, reason: "not_found" };
  if (actor.role !== "VISITOR") return { ok: false, reason: "not_visitor" };
  const ids = [...new Set(listingIds)].slice(0, maxLeadsPerLoad);
  if (ids.length === 0) return { ok: true, cards: {} };

  const now = new Date();
  const [profile, listings, leads] = await Promise.all([
    db.profile.findUniqueOrThrow({ where: { id: actor.id }, select: { fullName: true, phone: true, phoneIsWhatsapp: true } }),
    db.listing.findMany({
      where: { id: { in: ids } },
      select: { id: true, title: true, refCode: true, status: true, area: { select: { nameEn: true } }, assignedAgent: agentSelect },
    }),
    db.lead.findMany({
      where: { visitorId: actor.id, listingId: { in: ids }, status: { in: [...openLeadStatuses] } },
      select: {
        listingId: true,
        assignedAgent: agentSelect,
        viewings: { where: { status: { in: ["REQUESTED", "CONFIRMED"] } }, take: 1 },
      },
    }),
  ]);

  const slots = availableSlots(now);
  const phone = splitPhone(profile.phone);
  const prefill = { name: profile.fullName, countryCode: phone.countryCode, national: phone.national, whatsapp: profile.phoneIsWhatsapp };
  const cards: Record<string, BookingCardData> = {};
  for (const listing of listings) {
    const lead = leads.find((row) => row.listingId === listing.id);
    const active = lead?.viewings[0];
    cards[listing.id] = {
      listingId: listing.id,
      title: listing.title,
      areaName: listing.area.nameEn,
      refCode: listing.refCode,
      listingAvailable: listing.status === "PUBLISHED",
      slots,
      prefill,
      existing: active
        ? { viewingId: active.id, start: viewingStart(active).toISOString(), status: active.status as ExistingViewing["status"] }
        : null,
      // Before a lead exists, the listing's agent.
      advisorName: advisorName(lead ? lead.assignedAgent : listing.assignedAgent),
    };
  }
  return { ok: true, cards };
}

// ---------------------------------------------------------------------------
// Confirmation cards and the account list (AC-8, AC-11).

export type ViewingState = ViewingStatus | "AWAITING_UPDATE";

export type ViewingCard = {
  leadId: string;
  // The lead's current viewing: the active one, else the newest.
  viewingId: string;
  start: string;
  state: ViewingState;
  refCode: string;
  title: string;
  listingAvailable: boolean;
  leadOpen: boolean;
  advisorName: string;
  canChange: boolean;
  // Viewings on this lead the visitor moved to another time, so a card for
  // one of them reads "Rescheduled to <start>".
  rescheduledIds: string[];
};

const leadCardSelect = {
  id: true,
  status: true,
  listing: { select: { refCode: true, title: true, status: true } },
  assignedAgent: agentSelect,
  viewings: { orderBy: { createdAt: "desc" } },
} satisfies Prisma.LeadSelect;

type LeadCardRow = Prisma.LeadGetPayload<{ select: typeof leadCardSelect }>;
type ViewingRow = LeadCardRow["viewings"][number];

function stateOf(viewing: ViewingRow, now: Date): ViewingState {
  return isActiveViewing(viewing.status) && viewingStart(viewing) <= now ? "AWAITING_UPDATE" : viewing.status;
}

function toCard(lead: LeadCardRow, viewing: ViewingRow, now: Date): ViewingCard {
  return {
    leadId: lead.id,
    viewingId: viewing.id,
    start: viewingStart(viewing).toISOString(),
    state: stateOf(viewing, now),
    refCode: lead.listing?.refCode ?? "",
    title: lead.listing?.title ?? "",
    listingAvailable: lead.listing?.status === "PUBLISHED",
    leadOpen: (openLeadStatuses as readonly string[]).includes(lead.status),
    advisorName: advisorName(lead.assignedAgent),
    canChange: canVisitorChange(viewing, now),
    rescheduledIds: lead.viewings
      .filter((row) => row.status === "CANCELLED" && row.cancelReason === VISITOR_RESCHEDULE_REASON)
      .map((row) => row.id),
  };
}

export async function ownsConversation(actor: Actor, conversationId: string): Promise<boolean> {
  return (await db.conversation.count({ where: { id: conversationId, userId: actor.id } })) > 0;
}

// AC-8: each lead's current viewing, for the visitor's own leads only.
export async function viewingCards(actor: Actor, leadIds: string[]): Promise<Record<string, ViewingCard>> {
  const ids = [...new Set(leadIds)].slice(0, maxLeadsPerLoad);
  if (ids.length === 0) return {};
  const leads = await db.lead.findMany({ where: { id: { in: ids }, visitorId: actor.id }, select: leadCardSelect });
  const now = new Date();
  const cards: Record<string, ViewingCard> = {};
  for (const lead of leads) {
    const current = lead.viewings.find((row) => isActiveViewing(row.status)) ?? lead.viewings[0];
    if (current) cards[lead.id] = toCard(lead, current, now);
  }
  return cards;
}

type StoredMessage = { parts: ({ type: string } & Record<string, unknown>)[] };

// The leads of a conversation's confirmation cards.
export function viewingLeadIds(messages: StoredMessage[]): string[] {
  const ids: string[] = [];
  for (const message of messages) {
    for (const part of message.parts) {
      const leadId = part.type === "data-viewing" ? (part.data as { leadId?: unknown } | undefined)?.leadId : undefined;
      if (typeof leadId === "string") ids.push(leadId);
    }
  }
  return [...new Set(ids)];
}

// The listings of a conversation's booking cards (finished `offerViewing` calls).
export function offeredListingIds(messages: StoredMessage[]): string[] {
  const ids: string[] = [];
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== "tool-offerViewing" || part.state !== "output-available") continue;
      const listingId = (part.output as { listingId?: unknown } | undefined)?.listingId;
      if (typeof listingId === "string") ids.push(listingId);
    }
  }
  return [...new Set(ids)];
}

// AC-11: upcoming active viewings soonest first, then the 5 others with the
// latest start. Visitors only.
export async function listMyViewings(actor: Actor): Promise<{ upcoming: ViewingCard[]; recent: ViewingCard[] }> {
  if (actor.role !== "VISITOR") return { upcoming: [], recent: [] };
  const leads = await db.lead.findMany({ where: { visitorId: actor.id }, select: leadCardSelect });
  const now = new Date();
  const rows = leads.flatMap((lead) => lead.viewings.map((viewing) => toCard(lead, viewing, now)));
  const byStart = (a: ViewingCard, b: ViewingCard) => a.start.localeCompare(b.start);
  const upcoming = rows.filter((row) => row.state === "REQUESTED" || row.state === "CONFIRMED").sort(byStart);
  const recent = rows
    .filter((row) => row.state !== "REQUESTED" && row.state !== "CONFIRMED")
    .sort((a, b) => byStart(b, a))
    .slice(0, recentViewingsShown);
  return { upcoming, recent };
}

// ---------------------------------------------------------------------------
// The model's booking notes (AC-13): each lead's current viewing.

export type ViewingNote = { refCode: string; start: string; status: ViewingStatus };

export async function viewingNotes(conversationUserId: string, leadIds: string[]): Promise<Map<string, ViewingNote>> {
  const notes = new Map<string, ViewingNote>();
  if (leadIds.length === 0) return notes;
  const leads = await db.lead.findMany({
    where: { id: { in: [...new Set(leadIds)] }, visitorId: conversationUserId },
    select: { id: true, listing: { select: { refCode: true } }, viewings: { orderBy: { createdAt: "desc" } } },
  });
  for (const lead of leads) {
    const current = lead.viewings.find((row) => isActiveViewing(row.status)) ?? lead.viewings[0];
    if (current && lead.listing) {
      notes.set(lead.id, { refCode: lead.listing.refCode, start: viewingStart(current).toISOString(), status: current.status });
    }
  }
  return notes;
}
