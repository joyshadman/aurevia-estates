import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { normalizeBanglaDigits } from "@/lib/domain/bangla";
import type { PropertyType } from "@/lib/domain/listing-card";
import { rankMatches, type MatchCard } from "@/lib/domain/match-score";
import type { Prisma } from "@/lib/generated/prisma/client";
import { briefCriteria, briefForModel, briefUpdateInput, loadBrief, updateBrief } from "@/lib/server/assistant/brief";
import { shownListingIdsFor } from "@/lib/server/assistant/grounding";
import { db } from "@/lib/server/db";
import { countCandidateListings, loadScoreContext, publishedValue, searchCandidateListings } from "@/lib/server/listings";
import { toKatha, toTaka } from "@/lib/server/money";

// The assistant's server tools (spec 0006, *Tools*). Built per turn: the
// conversation comes from the session and stored state, never from the model.
// Each tool's model output is computed from its stored output alone, because
// `convertToModelMessages` reruns `toModelOutput` on history.

export const pageSize = 3;

export type ToolScope = {
  conversationId: string;
  // Listings shown by `searchListings` in the turn running now; their
  // recommendation rows are written only when the turn is saved.
  shownThisTurn: Set<string>;
};

// What the model may say about a shown card. The card's photo, price, and chips
// on screen come from the database at render time (AC-18), not from here.
export type MatchFacts = {
  refCode: string;
  title: string;
  areaName: string;
  propertyType: PropertyType;
  priceBdt: number;
  bedrooms: number | null;
  bathrooms: number | null;
  builtUpSqft: number | null;
  landKatha: number | null;
};

export type MatchesOutput = {
  cards: MatchCard[];
  facts: MatchFacts[];
  exactCount: number;
  total: number;
  hasMore: boolean;
  briefVersion: string | null;
};

// One page of the ranked matches for the stored brief. Shared with Show more.
export async function searchMatches(conversationId: string, page: number): Promise<MatchesOutput> {
  const [brief, context] = await Promise.all([loadBrief(conversationId), loadScoreContext()]);
  const criteria = briefCriteria(brief);
  const [candidates, total] = await Promise.all([
    searchCandidateListings(criteria, context),
    countCandidateListings(criteria, context),
  ]);
  const ranked = rankMatches(candidates, criteria, context);
  const cards = ranked.slice(page * pageSize, (page + 1) * pageSize);

  const rows = await db.listing.findMany({
    where: { id: { in: cards.map((card) => card.listingId) } },
    include: { area: true },
  });
  const facts = cards.flatMap((card) => {
    const row = rows.find((candidate) => candidate.id === card.listingId);
    if (!row) return [];
    return [
      {
        refCode: row.refCode,
        title: row.title,
        areaName: row.area.nameEn,
        propertyType: row.propertyType as PropertyType,
        priceBdt: toTaka(publishedValue(row.priceBdt, row.id, "price")),
        bedrooms: row.bedrooms,
        bathrooms: row.bathrooms,
        builtUpSqft: row.builtUpSqft,
        landKatha: toKatha(row.landKatha),
      },
    ];
  });

  return {
    cards,
    facts,
    exactCount: ranked.filter((card) => card.exact).length,
    total,
    hasMore: ranked.length > (page + 1) * pageSize,
    briefVersion: brief?.updatedAt.toISOString() ?? null,
  };
}

export const listingDetailsInclude = {
  area: true,
  amenities: { include: { amenity: true }, orderBy: { amenity: { sortOrder: "asc" } } },
} satisfies Prisma.ListingInclude;

type DetailsRow = Prisma.ListingGetPayload<{ include: typeof listingDetailsInclude }>;

// The facts `getListingDetails` may share. Never the agent's contact.
export function listingDetails(row: DetailsRow) {
  const priceBdt = toTaka(publishedValue(row.priceBdt, row.id, "price"));
  return {
    refCode: row.refCode,
    title: row.title,
    areaName: row.area.nameEn,
    propertyType: row.propertyType as PropertyType,
    priceBdt,
    priceNegotiable: row.priceNegotiable,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    builtUpSqft: row.builtUpSqft,
    landKatha: toKatha(row.landKatha),
    floorNumber: row.floorNumber,
    totalFloors: row.totalFloors,
    parkingSpaces: row.parkingSpaces,
    completionStatus: row.completionStatus,
    handoverDate: row.handoverDate?.toISOString().slice(0, 10) ?? null,
    amenities: row.amenities.map(({ amenity }) => amenity.label),
    description: publishedValue(row.description, row.id, "description"),
    pricePerSqftBdt: row.builtUpSqft ? Math.round(priceBdt / row.builtUpSqft) : null,
  };
}

export type ListingDetails = ReturnType<typeof listingDetails>;

// "AUR-1042", "aur 1042", "১০৪২" all name AUR-1042.
export function normalizeRefCode(input: string): string {
  const digits = normalizeBanglaDigits(input).match(/\d{4,}/)?.[0];
  return digits ? `AUR-${digits}` : input.trim().toUpperCase();
}

export function assistantTools(scope: ToolScope) {
  return {
    updateBrief: tool({
      description:
        "Store what the visitor said about the home they want. Send only the fields they mentioned or changed; each one replaces what is stored. Send null to clear a field.",
      inputSchema: briefUpdateInput,
      execute: async (input) => updateBrief(scope.conversationId, input),
      toModelOutput: ({ output }) => ({
        type: "json",
        value: { stored: briefForModel(output.brief), ignored: output.ignored },
      }),
    }),

    searchListings: tool({
      description:
        "Search the agency's published listings for the stored brief. Shows the visitor up to 3 ranked homes as cards. Call it after updateBrief.",
      inputSchema: z.object({}),
      execute: async () => {
        const output = await searchMatches(scope.conversationId, 0);
        for (const card of output.cards) scope.shownThisTurn.add(card.listingId);
        return output;
      },
      toModelOutput: ({ output }) => ({
        type: "json",
        value: {
          exactCount: output.exactCount,
          total: output.total,
          hasMore: output.hasMore,
          shown: output.cards.map((card) => ({
            ...output.facts.find((facts) => facts.refCode === card.refCode),
            matchPercent: card.matchPercent,
            exact: card.exact,
            why: card.why,
            differs: card.differs,
          })),
        },
      }),
    }),

    getListingDetails: tool({
      description: "Get the full details of a home already shown in this conversation, by its code (e.g. AUR-1042).",
      inputSchema: z.object({ refCode: z.string().min(1).max(20) }),
      execute: async ({ refCode }) => {
        const code = normalizeRefCode(refCode);
        const row = await db.listing.findUnique({ where: { refCode: code }, include: listingDetailsInclude });
        const allowed = await shownListingIdsFor(db, scope.conversationId, [...scope.shownThisTurn]);
        if (!row || !allowed.has(row.id)) return { error: "not_shown" as const, refCode: code };
        if (row.status !== "PUBLISHED") return { status: "unavailable" as const, refCode: code };
        return listingDetails(row);
      },
    }),
  };
}

export type AssistantTools = ReturnType<typeof assistantTools>;
