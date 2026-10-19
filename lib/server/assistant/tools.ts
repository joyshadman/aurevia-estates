import "server-only";
import { tool } from "ai";
import { z } from "zod";
import type { Brief } from "@/lib/domain/brief";
import { parseListingCode } from "@/lib/domain/chat-text";
import { propertyTypes } from "@/lib/domain/listing-card";
import type { Prisma } from "@/lib/generated/prisma/client";
import { rankMatches, type MatchCard } from "@/lib/domain/match-score";
import { briefForModel, loadReferenceData, type ReferenceData } from "@/lib/server/assistant/context";
import { loadBrief, saveBrief, type BriefPatch } from "@/lib/server/briefs";
import { db } from "@/lib/server/db";
import { countCandidateListings, listingDetailInclude, loadAreaContext, searchCandidateListings, serializeListing } from "@/lib/server/listings";

// The assistant's server tools (spec 0006, *Tools*). The model never passes a
// user, conversation, or listing id: everything is resolved from the turn. The
// model gets compact facts (`toModelOutput`); the client part gets the full
// output for the cards.

export const cardsPerPage = 3;

export type ToolContext = {
  conversationId: string;
  // Listing ids this conversation may discuss: shown before, its starting
  // listing, and anything `searchListings` shows during this turn.
  shownListingIds: Set<string>;
};

export type SearchListingsOutput = {
  cards: MatchCard[];
  exactCount: number;
  total: number;
  hasMore: boolean;
  briefVersion: string | null;
};

// Locks the conversation row for a write (every write holds it, spec 0006).
async function lockConversation(tx: Prisma.TransactionClient, conversationId: string) {
  await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${conversationId}::uuid FOR UPDATE`;
}

// Listing ids already shown in a conversation, plus its starting listing.
export async function loadShownListingIds(conversationId: string): Promise<Set<string>> {
  const [rows, conversation] = await Promise.all([
    db.listingRecommendation.findMany({ where: { conversationId }, select: { listingId: true }, distinct: ["listingId"] }),
    db.conversation.findUnique({ where: { id: conversationId }, select: { startListingId: true } }),
  ]);
  const ids = new Set(rows.map((r) => r.listingId));
  if (conversation?.startListingId) ids.add(conversation.startListingId);
  return ids;
}

// The facts the model may state about one listing. Never the agent's contact.
export async function listingFacts(listingId: string) {
  const row = await db.listing.findUnique({ where: { id: listingId }, include: listingDetailInclude });
  if (!row) return null;
  const listing = serializeListing(row);
  return {
    status: listing.status,
    facts: {
      refCode: listing.refCode,
      title: listing.title,
      area: listing.area.nameEn,
      propertyType: listing.propertyType,
      priceBdt: listing.priceBdt,
      priceNegotiable: listing.priceNegotiable,
      bedrooms: listing.bedrooms,
      bathrooms: listing.bathrooms,
      builtUpSqft: listing.builtUpSqft,
      landKatha: listing.landKatha,
      floorNumber: listing.floorNumber,
      totalFloors: listing.totalFloors,
      parkingSpaces: listing.parkingSpaces,
      completionStatus: listing.completionStatus,
      handoverDate: listing.handoverDate,
      amenities: listing.amenities.map((a) => a.label),
      description: listing.description,
      pricePerSqftBdt: listing.builtUpSqft ? Math.round(listing.priceBdt / listing.builtUpSqft) : null,
    },
  };
}

// Ranked results for the stored brief; `page` 0 is the first 3.
export async function rankForBrief(brief: Brief) {
  const [areas, amenities] = await Promise.all([
    loadAreaContext(),
    db.amenity.findMany({ select: { id: true, label: true } }),
  ]);
  const context = { areas, amenityLabels: new Map(amenities.map((a) => [a.id, a.label])) };
  const [candidates, total] = await Promise.all([
    searchCandidateListings(brief, areas),
    countCandidateListings(brief, areas),
  ]);
  return { ranked: rankMatches(candidates, brief, context), total };
}

// Title, area, price, and size for the model to talk about the cards.
async function cardFacts(cards: MatchCard[]) {
  const rows = await db.listing.findMany({
    where: { id: { in: cards.map((c) => c.listingId) } },
    select: { id: true, title: true, priceBdt: true, bedrooms: true, propertyType: true, area: { select: { nameEn: true } } },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return cards.map((card) => {
    const row = byId.get(card.listingId);
    return {
      code: card.refCode,
      title: row?.title,
      area: row?.area.nameEn,
      propertyType: row?.propertyType,
      priceBdt: row ? Number(row.priceBdt) : undefined,
      bedrooms: row?.bedrooms,
      matchPercent: card.matchPercent,
      exact: card.exact,
      why: card.why,
      differs: card.differs,
    };
  });
}

const slugList = z.array(z.string().max(60)).max(20);
const smallCount = z.number().int().min(0).max(30);

export const updateBriefInput = z.object({
  budgetMinBdt: z.number().int().positive().nullable().optional().describe("Lowest price in whole taka"),
  budgetMaxBdt: z.number().int().positive().nullable().optional().describe("Highest price in whole taka"),
  propertyTypes: z.array(z.enum(propertyTypes)).max(propertyTypes.length).optional(),
  areaSlugs: slugList.optional().describe("Area slugs from the list in the instructions"),
  amenitySlugs: slugList.optional().describe("Must have amenity slugs from the list in the instructions"),
  minBedrooms: smallCount.nullable().optional(),
  minBathrooms: smallCount.nullable().optional(),
  familySize: z.number().int().min(1).max(30).nullable().optional().describe("How many people will live there"),
  notes: z.string().max(500).nullable().optional().describe("Other needs, in a short sentence"),
});

export type UpdateBriefInput = z.infer<typeof updateBriefInput>;

// Maps tool input to a brief patch; unknown slugs are dropped and reported.
export function toBriefPatch(input: UpdateBriefInput, refs: ReferenceData) {
  const areaIds = new Map(refs.areas.map((a) => [a.slug, a.id]));
  const amenityIds = new Map(refs.amenities.map((a) => [a.slug, a.id]));
  const ignored: string[] = [];
  const mapSlugs = (slugs: string[], ids: Map<string, string>) =>
    slugs.flatMap((slug) => {
      const id = ids.get(slug.trim().toLowerCase());
      if (!id) ignored.push(slug);
      return id ? [id] : [];
    });

  const patch: BriefPatch = {};
  if (input.budgetMinBdt !== undefined) patch.budgetMinBdt = input.budgetMinBdt;
  if (input.budgetMaxBdt !== undefined) patch.budgetMaxBdt = input.budgetMaxBdt;
  if (input.propertyTypes !== undefined) patch.propertyTypes = input.propertyTypes;
  if (input.areaSlugs !== undefined) patch.areaIds = mapSlugs(input.areaSlugs, areaIds);
  if (input.amenitySlugs !== undefined) patch.amenityIds = mapSlugs(input.amenitySlugs, amenityIds);
  if (input.minBedrooms !== undefined) patch.minBedrooms = input.minBedrooms;
  if (input.minBathrooms !== undefined) patch.minBathrooms = input.minBathrooms;
  if (input.familySize !== undefined) patch.familySize = input.familySize;
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
  return { patch, ignored };
}

export function createAssistantTools(context: ToolContext) {
  const { conversationId, shownListingIds } = context;

  return {
    updateBrief: tool({
      description:
        "Save what the visitor said they need into their brief. Pass only the fields they mentioned; a field you pass replaces the stored one.",
      inputSchema: updateBriefInput,
      execute: async (input) => {
        const refs = await loadReferenceData();
        const { patch, ignored } = toBriefPatch(input, refs);
        const brief = await db.$transaction(async (tx) => {
          await lockConversation(tx, conversationId);
          return saveBrief(tx, conversationId, patch);
        });
        return { brief, view: briefForModel(brief, refs), ignored };
      },
      toModelOutput: ({ output }) => ({
        type: "json",
        value: { brief: output.view, ...(output.ignored.length > 0 ? { ignoredSlugs: output.ignored } : {}) },
      }),
    }),

    searchListings: tool({
      description:
        "Search the agency's published listings for the stored brief. Returns up to 3 homes, best first: exact matches, then close ones with what differs.",
      inputSchema: z.object({}),
      execute: async (): Promise<SearchListingsOutput & { facts: Awaited<ReturnType<typeof cardFacts>> }> => {
        const brief = await loadBrief(conversationId);
        const { ranked, total } = await rankForBrief(brief);
        const cards = ranked.slice(0, cardsPerPage);
        for (const card of cards) shownListingIds.add(card.listingId);
        return {
          cards,
          exactCount: ranked.filter((c) => c.exact).length,
          total,
          hasMore: ranked.length > cardsPerPage,
          briefVersion: brief.updatedAt,
          facts: await cardFacts(cards),
        };
      },
      toModelOutput: ({ output }) => ({
        type: "json",
        value: {
          total: output.total,
          exactMatches: output.exactCount,
          shown: output.facts,
          moreAvailable: output.hasMore,
        },
      }),
    }),

    getListingDetails: tool({
      description: "Get the full details of a home already shown in this conversation, by its code (like AUR-1042).",
      inputSchema: z.object({ refCode: z.string().max(20).describe("The listing code, like AUR-1042") }),
      execute: async ({ refCode }) => {
        const code = parseListingCode(refCode);
        if (!code) return { error: "not_shown" as const };
        const listing = await db.listing.findUnique({ where: { refCode: code }, select: { id: true } });
        if (!listing || !shownListingIds.has(listing.id)) return { error: "not_shown" as const };
        const details = await listingFacts(listing.id);
        if (!details || details.status !== "PUBLISHED") return { status: "unavailable" as const, refCode: code };
        return { status: "available" as const, listing: details.facts };
      },
    }),
  };
}

export type AssistantTools = ReturnType<typeof createAssistantTools>;
