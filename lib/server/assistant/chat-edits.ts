import "server-only";
import { removalNote, propertyTypeLabel, updatedBriefLabel, type RemovedItem } from "@/lib/assistant/copy";
import type { ChatLocale } from "@/lib/domain/bangla";
import type { PropertyType } from "@/lib/domain/listing-card";
import type { Prisma } from "@/lib/generated/prisma/client";
import { briefView, loadAssistantReference, type BriefView } from "@/lib/server/assistant/brief";
import { chatCards, type ChatCard } from "@/lib/server/assistant/cards";
import type { AssistantUIMessage, ChatMetadata } from "@/lib/server/assistant/history";
import { searchMatches, type MatchesOutput } from "@/lib/server/assistant/tools";
import type { Actor } from "@/lib/server/auth";
import { lockIdleConversation, saveServerMessage, type ChatMessageInput } from "@/lib/server/chat-store";
import { db } from "@/lib/server/db";
import { uuidv7 } from "@/lib/server/uuid";

// The visitor's edits to a chat that never call the model and never count
// toward the daily limit (spec 0006, *Brief pane*, *Show more*, AC-4, AC-12).
// Both hold the conversation lock and wait for a running reply.

type Refusal = { ok: false; reason: "not_found" | "invalid" | "turn_in_progress" };

// The language of the chat so far: the latest assistant message's locale.
async function chatLocale(tx: Prisma.TransactionClient, conversationId: string): Promise<ChatLocale> {
  const [row] = await tx.$queryRaw<{ locale: string | null }[]>`
    SELECT metadata->>'locale' AS locale FROM chat_messages
    WHERE conversation_id = ${conversationId}::uuid AND role = 'ASSISTANT'
    ORDER BY seq DESC LIMIT 1`;
  return row?.locale === "bn" ? "bn" : "en";
}

export const briefFields = [
  "budget",
  "propertyTypes",
  "areas",
  "amenities",
  "minBedrooms",
  "minBathrooms",
  "familySize",
  "notes",
] as const;

export type BriefField = (typeof briefFields)[number];

// Clears a field, or removes one value (an area id, an amenity id, a type) from
// an array, then saves the note "You removed Shibgonj from your brief."
export async function removeBriefItem(
  actor: Actor,
  input: { conversationId: string; field: BriefField; value?: string },
): Promise<{ ok: true; brief: BriefView; message: AssistantUIMessage } | Refusal> {
  // Read outside the transaction: its queries run in parallel.
  const reference = await loadAssistantReference();

  return db.$transaction(async (tx) => {
    const refused = await lockIdleConversation(tx, input.conversationId, actor);
    if (refused) return { ok: false, reason: refused };
    const stored = await tx.searchBrief.findUnique({ where: { conversationId: input.conversationId } });
    if (!stored) return { ok: false, reason: "invalid" };

    const locale = await chatLocale(tx, input.conversationId);
    let data: Prisma.SearchBriefUpdateInput;
    let item: RemovedItem;
    const { field, value } = input;

    if (field === "budget") {
      if (stored.budgetMinBdt === null && stored.budgetMaxBdt === null) return { ok: false, reason: "invalid" };
      data = { budgetMinBdt: null, budgetMaxBdt: null };
      item = { field };
    } else if (field === "minBedrooms" || field === "minBathrooms") {
      const count = stored[field];
      if (count === null) return { ok: false, reason: "invalid" };
      data = { [field]: null };
      item = { field, count };
    } else if (field === "familySize" || field === "notes") {
      if (stored[field] === null) return { ok: false, reason: "invalid" };
      data = { [field]: null };
      item = { field };
    } else if (field === "propertyTypes") {
      if (!value || !stored.propertyTypes.includes(value as PropertyType)) return { ok: false, reason: "invalid" };
      data = { propertyTypes: stored.propertyTypes.filter((type) => type !== value) };
      item = { field: "value", label: propertyTypeLabel(value as PropertyType, locale) };
    } else if (field === "areas") {
      const area = reference.areas.find((candidate) => candidate.id === value);
      if (!area || !stored.areaIds.includes(area.id)) return { ok: false, reason: "invalid" };
      data = { areaIds: stored.areaIds.filter((id) => id !== area.id) };
      item = { field: "value", label: locale === "bn" ? area.nameBn : area.nameEn };
    } else {
      const amenity = reference.amenities.find((candidate) => candidate.id === value);
      if (!amenity || !stored.amenityIds.includes(amenity.id)) return { ok: false, reason: "invalid" };
      data = { amenityIds: stored.amenityIds.filter((id) => id !== amenity.id) };
      item = { field: "value", label: locale === "bn" ? (amenity.labelBn ?? amenity.label) : amenity.label };
    }

    const row = await tx.searchBrief.update({ where: { conversationId: input.conversationId }, data });
    const message = {
      id: uuidv7(),
      role: "system",
      parts: [{ type: "text", text: removalNote(item, locale) }],
      metadata: { locale } satisfies ChatMetadata,
    } satisfies ChatMessageInput;
    await saveServerMessage(tx, input.conversationId, message);
    return { ok: true, brief: briefView(row, reference), message: message as AssistantUIMessage };
  });
}

type LatestResults = { messageId: string; results: NonNullable<ChatMetadata["results"]> } | null;

async function latestResults(client: Prisma.TransactionClient | typeof db, conversationId: string): Promise<LatestResults> {
  const [row] = await client.$queryRaw<{ id: string; results: NonNullable<ChatMetadata["results"]> }[]>`
    SELECT id, metadata->'results' AS results FROM chat_messages
    WHERE conversation_id = ${conversationId}::uuid AND metadata ? 'results'
    ORDER BY seq DESC LIMIT 1`;
  return row ? { messageId: row.id, results: row.results } : null;
}

async function briefVersion(client: Prisma.TransactionClient | typeof db, conversationId: string): Promise<string | null> {
  const row = await client.searchBrief.findUnique({ where: { conversationId }, select: { updatedAt: true } });
  return row?.updatedAt.toISOString() ?? null;
}

const showMoreAttempts = 3;

// The next 3 homes from the latest results, saved as an ASSISTANT message with
// one `data-matches` part. A changed brief starts again at page 0. The page is
// ranked before taking the lock (ranking runs parallel queries), then the lock
// confirms nothing moved in between; if something did, it ranks again.
export async function loadMoreMatches(
  actor: Actor,
  conversationId: string,
): Promise<{ ok: true; message: AssistantUIMessage; cards: Record<string, ChatCard> } | { ok: true; done: true } | Refusal> {
  for (let attempt = 0; attempt < showMoreAttempts; attempt++) {
    const owner = await db.conversation.findFirst({ where: { id: conversationId, userId: actor.id }, select: { id: true } });
    if (!owner) return { ok: false, reason: "not_found" };
    const [latest, version] = await Promise.all([latestResults(db, conversationId), briefVersion(db, conversationId)]);
    if (!latest) return { ok: true, done: true };
    const restart = version !== latest.results.briefVersion;
    const page = restart ? 0 : latest.results.nextPage;
    const output: MatchesOutput = await searchMatches(conversationId, page);

    const saved = await db.$transaction(async (tx) => {
      const refused = await lockIdleConversation(tx, conversationId, actor);
      if (refused) return { ok: false as const, reason: refused };
      const [lockedLatest, lockedVersion] = [await latestResults(tx, conversationId), await briefVersion(tx, conversationId)];
      if (lockedLatest?.messageId !== latest.messageId || lockedVersion !== version) return "moved" as const;
      if (output.cards.length === 0) return { ok: true as const, done: true as const };

      const locale = await chatLocale(tx, conversationId);
      const message = {
        id: uuidv7(),
        role: "assistant",
        parts: [{ type: "data-matches", data: { ...output, ...(restart ? { label: updatedBriefLabel(locale) } : {}) } }],
        metadata: {
          locale,
          results: { briefVersion: output.briefVersion, nextPage: page + 1, total: output.total },
        } satisfies ChatMetadata,
      } satisfies ChatMessageInput;
      await saveServerMessage(tx, conversationId, message);
      return { ok: true as const, message: message as unknown as AssistantUIMessage };
    });
    if (saved === "moved") continue;
    if (!saved.ok || !("message" in saved)) return saved;
    // The new cards' current data, so the client needs no second request.
    return { ...saved, cards: await chatCards(output.cards.map((card) => card.listingId)) };
  }
  return { ok: false, reason: "turn_in_progress" };
}
