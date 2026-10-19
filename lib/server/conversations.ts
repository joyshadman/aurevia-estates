import "server-only";
import { generateId } from "ai";
import { z } from "zod";
import { briefItemLabels, propertyTypeLabelsBn, removalNote } from "@/lib/assistant/copy";
import type { Brief } from "@/lib/domain/brief";
import type { ChatLocale } from "@/lib/domain/chat-text";
import { propertyTypeLabels, type ListingCardDTO, type PropertyType } from "@/lib/domain/listing-card";
import type { MatchCard } from "@/lib/domain/match-score";
import type { Prisma } from "@/lib/generated/prisma/client";
import { remainingMessages } from "@/lib/server/ai-usage";
import type { Actor } from "@/lib/server/auth";
import { cardsPerPage, rankForBrief } from "@/lib/server/assistant/tools";
import { loadBrief, saveBrief, type BriefPatch } from "@/lib/server/briefs";
import { saveServerMessage, type ChatMessageInput } from "@/lib/server/chat-store";
import { db } from "@/lib/server/db";
import { listingCardInclude, serializeListing, toCardDTO } from "@/lib/server/listings";
import { viewingCards, viewingRefsIn } from "@/lib/server/viewing-bookings";

// Conversations around the chat turn (spec 0006, *Conversations and fact sheet
// actions*, *Show more*, *Brief pane*, *Rendering*). Every write locks the
// conversation row; a busy conversation refuses with `turn_in_progress`.

export type ConversationFailure = { ok: false; reason: "not_found" | "invalid" | "turn_in_progress" };

const pageSize = 20;
const busyWindowSeconds = 90;

class Refused extends Error {
  constructor(readonly reason: ConversationFailure["reason"]) {
    super(reason);
  }
}

const refused = (reason: ConversationFailure["reason"]): ConversationFailure => ({ ok: false, reason });

// Locks the row and checks the owner; `busyCheck` also refuses during a reply.
async function lockOwned(tx: Prisma.TransactionClient, id: string, actor: Actor, busyCheck: boolean) {
  if (!z.uuid().safeParse(id).success) throw new Refused("not_found");
  const [row] = await tx.$queryRaw<{ user_id: string; busy: boolean }[]>`
    SELECT user_id, coalesce(turn_started_at > now() - make_interval(secs => ${busyWindowSeconds}), false) AS busy
    FROM conversations WHERE id = ${id}::uuid FOR UPDATE`;
  if (!row || row.user_id !== actor.id) throw new Refused("not_found");
  if (busyCheck && row.busy) throw new Refused("turn_in_progress");
}

async function guarded<T>(work: () => Promise<T>): Promise<T | ConversationFailure> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof Refused) return refused(error.reason);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// The list (AC-11). Keyset on (last_message_at desc, id desc).

export type ConversationRow = { id: string; title: string; lastMessageAt: string };

const listCursor = z.object({ at: z.iso.datetime(), id: z.uuid() });

export async function listConversations(actor: Actor, cursor?: string) {
  let after: z.infer<typeof listCursor> | null = null;
  if (cursor) {
    try {
      after = listCursor.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    } catch {
      after = null;
    }
  }
  const rows = await db.conversation.findMany({
    where: {
      userId: actor.id,
      ...(after
        ? { OR: [{ lastMessageAt: { lt: new Date(after.at) } }, { lastMessageAt: new Date(after.at), id: { lt: after.id } }] }
        : {}),
    },
    orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
    select: { id: true, title: true, lastMessageAt: true },
  });
  const page = rows.slice(0, pageSize);
  const last = page.at(-1);
  return {
    rows: page.map((r) => ({ id: r.id, title: r.title ?? "New conversation", lastMessageAt: r.lastMessageAt.toISOString() })),
    nextCursor:
      rows.length > pageSize && last
        ? Buffer.from(JSON.stringify({ at: last.lastMessageAt.toISOString(), id: last.id })).toString("base64url")
        : null,
  };
}

export async function renameConversation(raw: { id: string; title: string }, actor: Actor) {
  const parsed = z.object({ id: z.string(), title: z.string().trim().min(1).max(60) }).safeParse(raw);
  if (!parsed.success) return refused("invalid");
  return guarded(() =>
    db.$transaction(async (tx) => {
      await lockOwned(tx, parsed.data.id, actor, false);
      await tx.conversation.update({ where: { id: parsed.data.id }, data: { title: parsed.data.title } });
      return { ok: true as const };
    }),
  );
}

// Messages, brief, and recommendations go with it; leads and viewings stay with
// a null conversation (spec 0002 foreign keys).
export async function deleteConversation(raw: { id: string }, actor: Actor) {
  return guarded(() =>
    db.$transaction(async (tx) => {
      await lockOwned(tx, raw.id, actor, true);
      await tx.conversation.delete({ where: { id: raw.id } });
      return { ok: true as const };
    }),
  );
}

// ---------------------------------------------------------------------------
// Cards with current data (AC-18).

export type ChatCard = { listingId: string; available: true; listing: ListingCardDTO } | { listingId: string; available: false; title: string };

export async function chatCards(listingIds: string[]): Promise<Record<string, ChatCard>> {
  const ids = [...new Set(listingIds)].filter((id) => z.uuid().safeParse(id).success).slice(0, 60);
  if (ids.length === 0) return {};
  const rows = await db.listing.findMany({ where: { id: { in: ids } }, include: listingCardInclude });
  const cards: Record<string, ChatCard> = {};
  for (const row of rows) {
    cards[row.id] =
      row.status === "PUBLISHED"
        ? { listingId: row.id, available: true, listing: toCardDTO(serializeListing(row)) }
        : { listingId: row.id, available: false, title: row.title };
  }
  return cards;
}

type CardsData = { cards?: { listingId?: unknown }[] };

export function cardIdsIn(messages: ChatMessageInput[]): string[] {
  const ids: string[] = [];
  for (const message of messages) {
    for (const part of message.parts) {
      let data: CardsData | undefined;
      if (part.type === "tool-searchListings" && part.state === "output-available") data = part.output as CardsData;
      if (part.type === "data-matches") data = part.data as CardsData;
      for (const card of data?.cards ?? []) if (typeof card.listingId === "string") ids.push(card.listingId);
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// The brief pane (AC-3, AC-12): labels by locale.

export type BriefItem = { field: BriefField; value?: string; label: string; labelBn: string };
export const briefFields = ["budget", "areaIds", "propertyTypes", "amenityIds", "minBedrooms", "minBathrooms", "familySize", "notes"] as const;
export type BriefField = (typeof briefFields)[number];

async function briefLabels() {
  const [areas, amenities] = await Promise.all([
    db.area.findMany({ select: { id: true, nameEn: true, nameBn: true } }),
    db.amenity.findMany({ select: { id: true, label: true, labelBn: true } }),
  ]);
  return {
    areas: new Map(areas.map((a) => [a.id, { en: a.nameEn, bn: a.nameBn }])),
    amenities: new Map(amenities.map((a) => [a.id, { en: a.label, bn: a.labelBn ?? a.label }])),
  };
}

const taka = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function budgetLabel(brief: Brief): { en: string; bn: string } | null {
  const { budgetMinBdt: min, budgetMaxBdt: max } = brief;
  if (min === null && max === null) return null;
  const fmt = (n: number) => `BDT ${taka.format(n)}`;
  if (min !== null && max !== null) return { en: `${fmt(min)} to ${fmt(max)}`, bn: `${fmt(min)} থেকে ${fmt(max)}` };
  if (max !== null) return { en: `Up to ${fmt(max)}`, bn: `সর্বোচ্চ ${fmt(max)}` };
  return { en: `From ${fmt(min!)}`, bn: `কমপক্ষে ${fmt(min!)}` };
}

export async function briefItems(brief: Brief): Promise<BriefItem[]> {
  const labels = await briefLabels();
  const items: BriefItem[] = [];
  const budget = budgetLabel(brief);
  if (budget) items.push({ field: "budget", label: budget.en, labelBn: budget.bn });
  for (const id of brief.areaIds) {
    const name = labels.areas.get(id);
    if (name) items.push({ field: "areaIds", value: id, label: name.en, labelBn: name.bn });
  }
  for (const type of brief.propertyTypes) {
    items.push({ field: "propertyTypes", value: type, label: propertyTypeLabels[type], labelBn: propertyTypeLabelsBn[type] });
  }
  if (brief.minBedrooms !== null) {
    items.push({ field: "minBedrooms", label: `${brief.minBedrooms}+ bedrooms`, labelBn: `${brief.minBedrooms}+ শোবার ঘর` });
  }
  if (brief.minBathrooms !== null) {
    items.push({ field: "minBathrooms", label: `${brief.minBathrooms}+ bathrooms`, labelBn: `${brief.minBathrooms}+ বাথরুম` });
  }
  if (brief.familySize !== null) {
    items.push({ field: "familySize", label: `Household of ${brief.familySize}`, labelBn: `${brief.familySize} জনের পরিবার` });
  }
  for (const id of brief.amenityIds) {
    const name = labels.amenities.get(id);
    if (name) items.push({ field: "amenityIds", value: id, label: name.en, labelBn: name.bn });
  }
  if (brief.notes) items.push({ field: "notes", label: brief.notes, labelBn: brief.notes });
  return items;
}

async function latestLocale(tx: Prisma.TransactionClient, conversationId: string): Promise<ChatLocale> {
  const latest = await tx.chatMessage.findFirst({
    where: { conversationId, role: "ASSISTANT" },
    orderBy: { seq: "desc" },
    select: { metadata: true },
  });
  return (latest?.metadata as { locale?: ChatLocale } | null)?.locale === "bn" ? "bn" : "en";
}

export async function removeBriefItem(raw: { conversationId: string; field: string; value?: string }, actor: Actor) {
  const parsed = z
    .object({ conversationId: z.string(), field: z.enum(briefFields), value: z.string().max(60).optional() })
    .safeParse(raw);
  if (!parsed.success) return refused("invalid");
  const { conversationId, field, value } = parsed.data;

  return guarded(() =>
    db.$transaction(async (tx) => {
      await lockOwned(tx, conversationId, actor, true);
      const brief = await loadBrief(conversationId, tx);
      const labels = await briefLabels();
      const patch: BriefPatch = {};
      let label: { en: string; bn: string };

      if (field === "budget") {
        Object.assign(patch, { budgetMinBdt: null, budgetMaxBdt: null });
        label = briefItemLabels.budget;
      } else if (field === "areaIds" || field === "amenityIds" || field === "propertyTypes") {
        const list = brief[field] as string[];
        if (!value || !list.includes(value)) throw new Refused("invalid");
        (patch as Record<string, string[]>)[field] = list.filter((v) => v !== value);
        label =
          field === "areaIds"
            ? (labels.areas.get(value) ?? { en: "an area", bn: "একটি এলাকা" })
            : field === "amenityIds"
              ? (labels.amenities.get(value) ?? { en: "an amenity", bn: "একটি সুবিধা" })
              : { en: propertyTypeLabels[value as PropertyType], bn: propertyTypeLabelsBn[value as PropertyType] };
      } else {
        (patch as Record<string, null>)[field] = null;
        label = briefItemLabels[field];
      }

      const next = await saveBrief(tx, conversationId, patch);
      const locale = await latestLocale(tx, conversationId);
      const note: ChatMessageInput = {
        id: generateId(),
        role: "system",
        parts: [{ type: "text", text: removalNote(locale, locale === "bn" ? label.bn : label.en) }],
        metadata: { locale },
      };
      await saveServerMessage(tx, conversationId, note);
      return { ok: true as const, brief: next, message: note };
    }),
  );
}

// ---------------------------------------------------------------------------
// Show more (AC-4): the next 3 from the same ranked results, no model call.

type ResultsMeta = { briefVersion: string | null; nextPage: number; total: number };

export type MatchesData = { cards: MatchCard[]; total: number; hasMore: boolean; updatedBrief?: true };

export async function loadMoreMatches(raw: { conversationId: string }, actor: Actor) {
  return guarded(() =>
    db.$transaction(async (tx) => {
      await lockOwned(tx, raw.conversationId, actor, true);
      const latest = await tx.$queryRaw<{ metadata: { results?: ResultsMeta; locale?: ChatLocale } }[]>`
        SELECT metadata FROM chat_messages
        WHERE conversation_id = ${raw.conversationId}::uuid AND role = 'ASSISTANT' AND metadata ? 'results'
        ORDER BY seq DESC LIMIT 1`;
      const results = latest[0]?.metadata.results;
      if (!results) return { ok: true as const, done: true as const };

      const brief = await loadBrief(raw.conversationId, tx);
      const changed = brief.updatedAt !== results.briefVersion;
      const page = changed ? 0 : results.nextPage;
      const { ranked, total } = await rankForBrief(brief);
      const cards = ranked.slice(page * cardsPerPage, (page + 1) * cardsPerPage);
      if (cards.length === 0) return { ok: true as const, done: true as const };

      const data: MatchesData = {
        cards,
        total,
        hasMore: ranked.length > (page + 1) * cardsPerPage,
        ...(changed ? { updatedBrief: true as const } : {}),
      };
      const message: ChatMessageInput = {
        id: generateId(),
        role: "assistant",
        parts: [{ type: "data-matches", data }],
        metadata: {
          locale: latest[0].metadata.locale ?? "en",
          results: { briefVersion: brief.updatedAt, nextPage: page + 1, total },
        },
      };
      await saveServerMessage(tx, raw.conversationId, message);
      return { ok: true as const, done: false as const, message };
    }),
  );
}

// ---------------------------------------------------------------------------
// The page (AC-2, AC-11, AC-18): messages, brief, and cards from the database.

export async function loadConversationPage(id: string, actor: Actor) {
  if (!z.uuid().safeParse(id).success) return null;
  const conversation = await db.conversation.findFirst({
    where: { id, userId: actor.id },
    select: {
      id: true,
      title: true,
      startListing: { select: { title: true, status: true, area: { select: { nameEn: true } } } },
      messages: { orderBy: { seq: "asc" } },
    },
  });
  if (!conversation) return null;
  const messages: ChatMessageInput[] = conversation.messages.map((row) => ({
    id: row.id,
    role: row.role.toLowerCase() as ChatMessageInput["role"],
    parts: row.parts as ChatMessageInput["parts"],
    ...(row.metadata === null ? {} : { metadata: row.metadata }),
  }));
  const brief = await loadBrief(id);
  const [cards, items, viewings] = await Promise.all([
    chatCards(cardIdsIn(messages)),
    briefItems(brief),
    viewingCards(viewingRefsIn(messages), actor),
  ]);
  const start = conversation.startListing;
  return {
    id: conversation.id,
    title: conversation.title,
    messages,
    cards,
    viewingCards: viewings,
    briefItems: items,
    startListing: start?.status === "PUBLISHED" ? { title: start.title, areaName: start.area.nameEn } : null,
  };
}

export async function startListingBySlug(slug: string | undefined) {
  if (!slug || slug.length > 200) return null;
  const row = await db.listing.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: { slug: true, title: true, area: { select: { nameEn: true } } },
  });
  return row ? { slug: row.slug, title: row.title, areaName: row.area.nameEn } : null;
}

// The side panes after a reply: brief, the first page of conversations, messages left.
export async function chatSidePanes(conversationId: string, actor: Actor) {
  const owned = await db.conversation.count({ where: { id: conversationId, userId: actor.id } });
  if (owned === 0) return null;
  const [brief, conversations, remaining] = await Promise.all([
    loadBrief(conversationId),
    listConversations(actor),
    actor.role === "VISITOR" ? remainingMessages(actor.id) : Promise.resolve(null),
  ]);
  return { briefItems: await briefItems(brief), conversations, remaining };
}
