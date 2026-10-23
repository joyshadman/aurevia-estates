import "server-only";
import { z } from "zod";
import { propertyTypes, type PropertyType } from "@/lib/domain/listing-card";
import type { BriefCriteria } from "@/lib/domain/match-score";
import type { Prisma, SearchBrief } from "@/lib/generated/prisma/client";
import { db } from "@/lib/server/db";
import { fromTaka, toTaka } from "@/lib/server/money";

// The conversation's search brief (spec 0006, AC-3). Written only by the
// `updateBrief` tool and brief removal. `updated_at` is the brief version.

type Client = Pick<Prisma.TransactionClient, "searchBrief" | "area" | "amenity">;

export type AssistantReference = {
  areas: { id: string; slug: string; nameEn: string; nameBn: string }[];
  amenities: { id: string; slug: string; label: string; labelBn: string | null }[];
};

// Active areas and amenities: what the model may name, and what slugs map to.
export async function loadAssistantReference(client: Client = db): Promise<AssistantReference> {
  const [areas, amenities] = await Promise.all([
    client.area.findMany({
      where: { isActive: true },
      select: { id: true, slug: true, nameEn: true, nameBn: true },
      orderBy: { sortOrder: "asc" },
    }),
    client.amenity.findMany({
      where: { isActive: true },
      select: { id: true, slug: true, label: true, labelBn: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  return { areas, amenities };
}

export type BriefView = {
  budgetMinBdt: number | null;
  budgetMaxBdt: number | null;
  propertyTypes: PropertyType[];
  areas: AssistantReference["areas"];
  amenities: AssistantReference["amenities"];
  minBedrooms: number | null;
  minBathrooms: number | null;
  familySize: number | null;
  notes: string | null;
  // The brief version; null before anything was stored.
  updatedAt: string | null;
};

export function briefView(row: SearchBrief | null, reference: AssistantReference): BriefView {
  return {
    budgetMinBdt: row?.budgetMinBdt == null ? null : toTaka(row.budgetMinBdt),
    budgetMaxBdt: row?.budgetMaxBdt == null ? null : toTaka(row.budgetMaxBdt),
    propertyTypes: (row?.propertyTypes ?? []) as PropertyType[],
    areas: reference.areas.filter((area) => row?.areaIds.includes(area.id)),
    amenities: reference.amenities.filter((amenity) => row?.amenityIds.includes(amenity.id)),
    minBedrooms: row?.minBedrooms ?? null,
    minBathrooms: row?.minBathrooms ?? null,
    familySize: row?.familySize ?? null,
    notes: row?.notes ?? null,
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}

export function briefCriteria(row: SearchBrief | null): BriefCriteria {
  return {
    budgetMinBdt: row?.budgetMinBdt == null ? null : toTaka(row.budgetMinBdt),
    budgetMaxBdt: row?.budgetMaxBdt == null ? null : toTaka(row.budgetMaxBdt),
    propertyTypes: (row?.propertyTypes ?? []) as PropertyType[],
    areaIds: row?.areaIds ?? [],
    amenityIds: row?.amenityIds ?? [],
    minBedrooms: row?.minBedrooms ?? null,
  };
}

// The brief as the model reads it: slugs, never ids.
export function briefForModel(view: BriefView) {
  return {
    budgetMinBdt: view.budgetMinBdt,
    budgetMaxBdt: view.budgetMaxBdt,
    propertyTypes: view.propertyTypes,
    areaSlugs: view.areas.map((area) => area.slug),
    amenitySlugs: view.amenities.map((amenity) => amenity.slug),
    minBedrooms: view.minBedrooms,
    minBathrooms: view.minBathrooms,
    familySize: view.familySize,
    notes: view.notes,
  };
}

export async function loadBrief(conversationId: string, client: Client = db): Promise<SearchBrief | null> {
  return client.searchBrief.findUnique({ where: { conversationId } });
}

const taka = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

// `null` clears a field; a missing field keeps what is stored.
export const briefUpdateInput = z.object({
  budgetMinBdt: taka.nullable().optional().describe("Lowest price in whole taka. 1 lakh = 100000, 1 crore = 10000000."),
  budgetMaxBdt: taka.nullable().optional().describe("Highest price in whole taka. 1 lakh = 100000, 1 crore = 10000000."),
  propertyTypes: z.array(z.enum(propertyTypes)).max(propertyTypes.length).optional(),
  areaSlugs: z.array(z.string().max(60)).max(10).optional().describe("Area slugs from the areas list. Replaces the stored list."),
  amenitySlugs: z
    .array(z.string().max(60))
    .max(12)
    .optional()
    .describe("Must have amenity slugs from the amenities list. Replaces the stored list."),
  minBedrooms: z.number().int().min(0).max(20).nullable().optional(),
  minBathrooms: z.number().int().min(0).max(20).nullable().optional(),
  familySize: z.number().int().min(1).max(30).nullable().optional().describe("How many people will live in the home."),
  notes: z.string().max(500).nullable().optional().describe("Other needs in a few words, e.g. near a school, quiet street."),
});

export type BriefUpdate = z.infer<typeof briefUpdateInput>;

// Provided fields replace stored ones. Unknown slugs are dropped and listed in
// `ignored`; a minimum above the maximum is swapped.
export async function updateBrief(conversationId: string, input: BriefUpdate, client: Client = db) {
  const reference = await loadAssistantReference(client);
  const ignored: string[] = [];
  const idsFor = (slugs: string[] | undefined, known: { id: string; slug: string }[]) => {
    if (slugs === undefined) return undefined;
    const ids: string[] = [];
    for (const slug of slugs) {
      const match = known.find((item) => item.slug === slug.trim().toLowerCase());
      if (match) ids.push(match.id);
      else ignored.push(slug);
    }
    return [...new Set(ids)];
  };

  const stored = await loadBrief(conversationId, client);
  const merged = (given: number | null | undefined, kept: bigint | null | undefined) =>
    given === undefined ? (kept ?? null) : given === null ? null : fromTaka(given);
  let min = merged(input.budgetMinBdt, stored?.budgetMinBdt);
  let max = merged(input.budgetMaxBdt, stored?.budgetMaxBdt);
  if (min !== null && max !== null && min > max) [min, max] = [max, min];

  const data = {
    budgetMinBdt: min,
    budgetMaxBdt: max,
    propertyTypes: input.propertyTypes && [...new Set(input.propertyTypes)],
    areaIds: idsFor(input.areaSlugs, reference.areas),
    amenityIds: idsFor(input.amenitySlugs, reference.amenities),
    minBedrooms: input.minBedrooms,
    minBathrooms: input.minBathrooms,
    familySize: input.familySize,
    notes: input.notes === undefined ? undefined : input.notes?.trim() || null,
  } satisfies Prisma.SearchBriefUncheckedUpdateInput;

  const row = await client.searchBrief.upsert({
    where: { conversationId },
    create: { conversationId, ...data },
    update: data,
  });
  return { brief: briefView(row, reference), ignored };
}
