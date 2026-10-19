import "server-only";
import { generateId } from "ai";
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { z } from "zod";
import { InvalidTransitionError } from "@/lib/domain/errors";
import {
  availableSlots,
  canVisitorChange,
  CANCELLED_BY_VISITOR,
  formatViewingTime,
  isActiveViewing,
  isAvailableSlot,
  MAX_ACTIVE_VIEWINGS,
  MAX_VISITOR_CHANGES,
  RESCHEDULED_BY_VISITOR,
  viewingStart,
  type Slot,
} from "@/lib/domain/viewing-slots";
import type { Prisma, ViewingStatus } from "@/lib/generated/prisma/client";
import type { Actor } from "@/lib/server/auth";
import { loadShownListingIds } from "@/lib/server/assistant/tools";
import { findOrCreateLeadAndViewing, isOpenLead, rescheduleViewing } from "@/lib/server/bookings";
import { saveServerMessage, type ChatMessageInput } from "@/lib/server/chat-store";
import { db } from "@/lib/server/db";
import { ListingNotBookableError, StaleStatusError } from "@/lib/server/errors";
import { transitionViewingIn } from "@/lib/server/viewing-status";

// Viewing booking from chat (spec 0007, *Actions and reads*). The model only
// shows a card; a booking needs the visitor's Confirm, checked here against the
// conversation, the shown set, and the slot set at that moment.

export type BookingReason =
  | "not_found"
  | "not_visitor"
  | "turn_in_progress"
  | "invalid"
  | "slot_unavailable"
  | "listing_unavailable"
  | "already_booked"
  | "too_many_viewings"
  | "too_late"
  | "unchanged"
  | "lead_closed"
  | "too_many_changes"
  | "stale_status";

export type BookingFailure = {
  ok: false;
  reason: BookingReason;
  fieldErrors?: Record<string, string>;
  slots?: Slot[];
  existing?: ExistingViewing;
};

export type ExistingViewing = { viewingId: string; start: string; status: ViewingStatus; canChange: boolean };

class Refused extends Error {
  constructor(readonly failure: BookingFailure) {
    super(failure.reason);
  }
}

const refuse = (reason: BookingReason, extra: Omit<BookingFailure, "ok" | "reason"> = {}): never => {
  throw new Refused({ ok: false, reason, ...extra });
};

async function guarded<T>(work: () => Promise<T>): Promise<T | BookingFailure> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof Refused) return error.failure;
    if (error instanceof StaleStatusError || error instanceof InvalidTransitionError) return { ok: false, reason: "stale_status" };
    if (error instanceof ListingNotBookableError) return { ok: false, reason: "listing_unavailable" };
    throw error;
  }
}

const isUuid = (value: unknown) => z.uuid().safeParse(value).success;

// The advisor buyers see: the lead's agent (or the listing's before a lead
// exists) when their profile is public; otherwise a generic name.
type AgentRow = { fullName: string | null; agentIsPublic: boolean; deletedAt: Date | null } | null;
export function advisorDisplayName(agent: AgentRow): string {
  return agent && agent.agentIsPublic && !agent.deletedAt && agent.fullName?.trim() ? agent.fullName.trim() : "an Aurevia advisor";
}

const agentSelect = { select: { fullName: true, agentIsPublic: true, deletedAt: true } } as const;

// ---------------------------------------------------------------------------
// Countries for the phone field: code, name, and dialling code.

let countryList: { code: CountryCode; name: string; dial: string }[] | null = null;
export function phoneCountries() {
  if (!countryList) {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    countryList = getCountries()
      .map((code) => ({ code, name: names.of(code) ?? code, dial: `+${getCountryCallingCode(code)}` }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  return countryList;
}

// ---------------------------------------------------------------------------
// The booking card (AC-2): fetched when it renders, so slots and prefill are current.

async function openLeadWithActive(tx: Prisma.TransactionClient | typeof db, visitorId: string, listingId: string) {
  return tx.lead.findFirst({
    where: { visitorId, listingId, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] } },
    include: { viewings: { where: { status: { in: ["REQUESTED", "CONFIRMED"] } } } },
  });
}

function existingOf(viewing: { id: string; status: ViewingStatus; requestedFor: Date; confirmedFor: Date | null }, now: Date): ExistingViewing {
  return {
    viewingId: viewing.id,
    start: viewingStart(viewing).toISOString(),
    status: viewing.status,
    canChange: canVisitorChange(viewing, now),
  };
}

export async function getBookingCardData(raw: { conversationId: string; listingId: string }, user: Actor, now = new Date()) {
  if (!isUuid(raw.conversationId) || !isUuid(raw.listingId)) return { ok: false as const, reason: "not_found" as const };
  const owned = await db.conversation.count({ where: { id: raw.conversationId, userId: user.id } });
  const listing = await db.listing.findUnique({
    where: { id: raw.listingId },
    select: { id: true, title: true, refCode: true, status: true, area: { select: { nameEn: true } }, assignedAgent: agentSelect },
  });
  if (owned === 0 || !listing) return { ok: false as const, reason: "not_found" as const };

  const profile = await db.profile.findUniqueOrThrow({
    where: { id: user.id },
    select: { fullName: true, phone: true, phoneIsWhatsapp: true },
  });
  const parsed = profile.phone ? parsePhoneNumberFromString(profile.phone) : undefined;
  const lead = user.role === "VISITOR" ? await openLeadWithActive(db, user.id, listing.id) : null;
  const leadAgent = lead?.assignedAgentId
    ? await db.profile.findUnique({ where: { id: lead.assignedAgentId }, select: agentSelect.select })
    : null;

  return {
    ok: true as const,
    title: listing.title,
    areaName: listing.area.nameEn,
    refCode: listing.refCode,
    listingStatus: listing.status,
    slots: availableSlots(now),
    prefill: {
      name: profile.fullName ?? "",
      // The national number with its country, so the form shows it as typed.
      phone: parsed?.nationalNumber ?? "",
      countryCode: (parsed?.country ?? "BD") as CountryCode,
      whatsapp: profile.phoneIsWhatsapp,
    },
    countries: phoneCountries(),
    existing: lead?.viewings[0] ? existingOf(lead.viewings[0], now) : null,
    advisorName: advisorDisplayName(lead ? leadAgent : listing.assignedAgent),
  };
}

export type BookingCardData = Extract<Awaited<ReturnType<typeof getBookingCardData>>, { ok: true }>;

// ---------------------------------------------------------------------------
// Confirm (AC-4, AC-5, AC-6, AC-10, AC-12).

export const requestViewingInput = z.object({
  conversationId: z.string(),
  listingId: z.string(),
  start: z.string().max(40),
  name: z.string().trim().min(1, "Enter your name").max(80, "Up to 80 characters"),
  phone: z.string().trim().min(1, "Enter your phone number").max(30),
  countryCode: z.string().length(2),
  whatsapp: z.boolean(),
  note: z.string().trim().max(500, "Up to 500 characters").optional(),
});

function e164(phone: string, country: string): string | null {
  const parsed = parsePhoneNumberFromString(phone, country.toUpperCase() as CountryCode);
  return parsed?.isValid() ? parsed.number : null;
}

export async function requestViewing(raw: z.input<typeof requestViewingInput>, user: Actor, now = new Date()) {
  if (user.role !== "VISITOR") return { ok: false as const, reason: "not_visitor" as const };
  const parsed = requestViewingInput.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { ok: false as const, reason: "invalid" as const, fieldErrors };
  }
  const input = parsed.data;
  if (!isUuid(input.conversationId) || !isUuid(input.listingId)) return { ok: false as const, reason: "not_found" as const };
  const phone = e164(input.phone, input.countryCode);
  if (!phone) return { ok: false as const, reason: "invalid" as const, fieldErrors: { phone: "Check the number and the country" } };
  const shown = await loadShownListingIds(input.conversationId);

  return guarded(() =>
    db.$transaction(async (tx) => {
      // 1. The conversation is the visitor's and no reply is streaming.
      const [conversation] = await tx.$queryRaw<{ user_id: string; busy: boolean }[]>`
        SELECT user_id, coalesce(turn_started_at > now() - interval '90 seconds', false) AS busy
        FROM conversations WHERE id = ${input.conversationId}::uuid FOR UPDATE`;
      if (!conversation || conversation.user_id !== user.id) refuse("not_found");
      if (conversation.busy) refuse("turn_in_progress");
      if (!shown.has(input.listingId)) refuse("not_found");
      const listing = await tx.listing.findUnique({ where: { id: input.listingId }, select: { status: true } });
      if (listing?.status !== "PUBLISHED") refuse("listing_unavailable");

      // 2. Only a slot in the set right now.
      if (!isAvailableSlot(input.start, now)) refuse("slot_unavailable", { slots: availableSlots(now) });
      const start = new Date(input.start);

      // 4, 5. The open lead, locked: a double submit is a success; another time is "already booked".
      const [open] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM leads WHERE visitor_id = ${user.id}::uuid AND listing_id = ${input.listingId}::uuid
          AND status IN ('NEW', 'CONTACTED', 'QUALIFIED') FOR UPDATE`;
      if (open) {
        const active = await tx.viewing.findFirst({ where: { leadId: open.id, status: { in: ["REQUESTED", "CONFIRMED"] } } });
        if (active) {
          if (active.requestedFor.getTime() === start.getTime()) {
            return { ok: true as const, leadId: open.id, viewingId: active.id, reused: true, message: null };
          }
          refuse("already_booked", { existing: existingOf(active, now) });
        }
      }

      // 6. At most 5 active viewings with a future start.
      const active = await tx.viewing.findMany({
        where: { status: { in: ["REQUESTED", "CONFIRMED"] }, lead: { visitorId: user.id } },
        select: { status: true, requestedFor: true, confirmedFor: true },
      });
      if (active.filter((v) => viewingStart(v) > now).length >= MAX_ACTIVE_VIEWINGS) refuse("too_many_viewings");

      // 7, 8. The profile, then the lead and viewing.
      await tx.profile.update({ where: { id: user.id }, data: { fullName: input.name, phone, phoneIsWhatsapp: input.whatsapp } });
      const booked = await findOrCreateLeadAndViewing(
        tx,
        {
          listingId: input.listingId,
          requestedFor: start,
          name: input.name,
          phone,
          conversationId: input.conversationId,
          note: input.note,
          contactWhatsapp: input.whatsapp,
        },
        user,
      );

      // 9. The confirmation card, saved in the chat: no model call, no limit slot (AC-5).
      const message: ChatMessageInput = {
        id: generateId(),
        role: "assistant",
        parts: [{ type: "data-viewing", data: { leadId: booked.lead.id, viewingId: booked.viewing.id } }],
        metadata: { locale: "en" },
      };
      await saveServerMessage(tx, input.conversationId, message);
      return { ok: true as const, leadId: booked.lead.id, viewingId: booked.viewing.id, reused: false, message };
    }),
  );
}

// ---------------------------------------------------------------------------
// Change and cancel (AC-9, AC-10). No conversation lock: these run from /account too.

async function lockOwnViewing(tx: Prisma.TransactionClient, viewingId: string, user: Actor) {
  if (!isUuid(viewingId)) refuse("not_found");
  const viewing = await tx.viewing.findUnique({ where: { id: viewingId } });
  if (!viewing) refuse("not_found");
  const [lead] = await tx.$queryRaw<{ id: string; visitor_id: string | null; status: string; listing_id: string | null }[]>`
    SELECT id, visitor_id, status, listing_id FROM leads WHERE id = ${viewing!.leadId}::uuid FOR UPDATE`;
  if (!lead || lead.visitor_id !== user.id) refuse("not_found");
  return { viewing: viewing!, lead };
}

export async function changeViewingTime(raw: { viewingId: string; start: string }, user: Actor, now = new Date()) {
  if (user.role !== "VISITOR") return { ok: false as const, reason: "not_found" as const };
  return guarded(() =>
    db.$transaction(async (tx) => {
      const { viewing, lead } = await lockOwnViewing(tx, raw.viewingId, user);
      if (!canVisitorChange(viewing, now)) refuse("too_late");
      if (!isOpenLead(lead.status)) refuse("lead_closed");
      const listing = lead.listing_id ? await tx.listing.findUnique({ where: { id: lead.listing_id }, select: { status: true } }) : null;
      if (listing?.status !== "PUBLISHED") refuse("listing_unavailable");
      if (!isAvailableSlot(String(raw.start), now)) refuse("slot_unavailable", { slots: availableSlots(now) });
      const start = new Date(raw.start);
      if (start.getTime() === viewingStart(viewing).getTime()) refuse("unchanged");
      const changes = await tx.viewing.count({ where: { leadId: lead.id, status: "CANCELLED", cancelReason: RESCHEDULED_BY_VISITOR } });
      if (changes >= MAX_VISITOR_CHANGES) refuse("too_many_changes");
      const next = await rescheduleViewing(tx, viewing.id, start, user, RESCHEDULED_BY_VISITOR);
      return { ok: true as const, viewingId: next.id };
    }),
  );
}

export async function cancelViewing(raw: { viewingId: string; reason?: string }, user: Actor, now = new Date()) {
  if (user.role !== "VISITOR") return { ok: false as const, reason: "not_found" as const };
  const reason = typeof raw.reason === "string" ? raw.reason.trim().slice(0, 200) : "";
  return guarded(() =>
    db.$transaction(async (tx) => {
      const { viewing } = await lockOwnViewing(tx, raw.viewingId, user);
      if (!canVisitorChange(viewing, now)) refuse("too_late");
      await transitionViewingIn(tx, viewing.id, "CANCELLED", user, { cancelReason: reason || CANCELLED_BY_VISITOR });
      return { ok: true as const };
    }),
  );
}

// ---------------------------------------------------------------------------
// Live confirmation cards (AC-8) and the visitor's list (AC-11).

export type ViewingCard = {
  leadId: string;
  // The card's own viewing, and the lead's current one (active, else newest).
  viewingId: string;
  current: { viewingId: string; status: ViewingStatus; start: string; confirmed: boolean; canChange: boolean; awaitingUpdate: boolean };
  rescheduled: boolean;
  listing: { title: string; refCode: string; available: boolean };
  advisorName: string;
  leadOpen: boolean;
};

const leadCardInclude = {
  viewings: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
  listing: { select: { title: true, refCode: true, status: true } },
  assignedAgent: agentSelect,
} satisfies Prisma.LeadInclude;

type LeadForCard = Prisma.LeadGetPayload<{ include: typeof leadCardInclude }>;

function toCard(lead: LeadForCard, viewingId: string, now: Date): ViewingCard | null {
  const current = lead.viewings.find((v) => isActiveViewing(v.status)) ?? lead.viewings[0];
  if (!current || !lead.listing) return null;
  const original = lead.viewings.find((v) => v.id === viewingId);
  const start = viewingStart(current);
  return {
    leadId: lead.id,
    viewingId,
    current: {
      viewingId: current.id,
      status: current.status,
      start: start.toISOString(),
      confirmed: current.confirmedFor !== null,
      canChange: canVisitorChange(current, now) && isOpenLead(lead.status) && lead.listing.status === "PUBLISHED",
      awaitingUpdate: isActiveViewing(current.status) && start <= now,
    },
    rescheduled: original?.status === "CANCELLED" && original.cancelReason === RESCHEDULED_BY_VISITOR && current.id !== original.id,
    listing: { title: lead.listing.title, refCode: lead.listing.refCode, available: lead.listing.status === "PUBLISHED" },
    advisorName: advisorDisplayName(lead.assignedAgent),
    leadOpen: isOpenLead(lead.status),
  };
}

// `refs`: the `data-viewing` parts of a conversation. Only the user's own leads.
export async function viewingCards(refs: { leadId: string; viewingId: string }[], user: Actor, now = new Date()) {
  const ids = [...new Set(refs.map((r) => r.leadId))].filter(isUuid);
  if (ids.length === 0) return {};
  const leads = await db.lead.findMany({ where: { id: { in: ids }, visitorId: user.id }, include: leadCardInclude });
  const byId = new Map(leads.map((l) => [l.id, l]));
  const cards: Record<string, ViewingCard> = {};
  for (const ref of refs) {
    const lead = byId.get(ref.leadId);
    const card = lead ? toCard(lead, ref.viewingId, now) : null;
    if (card) cards[ref.viewingId] = card;
  }
  return cards;
}

export function viewingRefsIn(messages: ChatMessageInput[]): { leadId: string; viewingId: string }[] {
  return messages.flatMap((m) =>
    m.parts.flatMap((p) => {
      const data = p.type === "data-viewing" ? (p.data as { leadId?: unknown; viewingId?: unknown }) : null;
      return data && typeof data.leadId === "string" && typeof data.viewingId === "string"
        ? [{ leadId: data.leadId, viewingId: data.viewingId }]
        : [];
    }),
  );
}

export async function listMyViewings(user: Actor, now = new Date()) {
  if (user.role !== "VISITOR") return { upcoming: [], recent: [] };
  const leads = await db.lead.findMany({ where: { visitorId: user.id, listingId: { not: null } }, include: leadCardInclude });
  const rows = leads.flatMap((lead) =>
    lead.viewings
      .filter((v) => !(v.status === "CANCELLED" && v.cancelReason === RESCHEDULED_BY_VISITOR))
      .map((v) => toCard({ ...lead, viewings: [v] }, v.id, now))
      .filter((card): card is ViewingCard => card !== null),
  );
  const upcoming = rows
    .filter((r) => isActiveViewing(r.current.status) && !r.current.awaitingUpdate)
    .sort((a, b) => a.current.start.localeCompare(b.current.start));
  const recent = rows
    .filter((r) => !upcoming.includes(r))
    .sort((a, b) => b.current.start.localeCompare(a.current.start))
    .slice(0, 5);
  return { upcoming, recent };
}

// The model's note for each booking in later turns (AC-13), from current data.
export async function bookingNotes(refs: { leadId: string; viewingId: string }[], now = new Date()) {
  const ids = [...new Set(refs.map((r) => r.leadId))].filter(isUuid);
  if (ids.length === 0) return new Map<string, string>();
  const leads = await db.lead.findMany({ where: { id: { in: ids } }, include: leadCardInclude });
  const notes = new Map<string, string>();
  for (const lead of leads) {
    const card = toCard(lead, lead.viewings[0]?.id ?? "", now);
    if (!card) continue;
    const when = formatViewingTime(card.current.start);
    notes.set(lead.id, `Viewing for ${card.listing.refCode}: ${when} Sylhet, status ${card.current.status}.`);
  }
  return notes;
}
