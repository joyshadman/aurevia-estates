import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import { likeLiteral } from "@/lib/domain/like";
import { propertyTypes, type ListingCardDTO, type PropertyType } from "@/lib/domain/listing-card";
import type { SearchFilters, SearchRefs, SearchSort } from "@/lib/domain/search-params";
import type { Prisma } from "@/lib/generated/prisma/client";
import { db } from "@/lib/server/db";
import { listingCardInclude, serializeListing, toCardDTO } from "@/lib/server/listings";

// Public discovery reads (spec 0010). One `buildWhere` serves results, the
// total, and the facets, so they never disagree. All cached under `listings`,
// which spec 0005's actions refresh on every public change.

export const searchPageSize = 24;

export type SearchCard = ListingCardDTO & { pricePerSqft: number | null };

// Active areas and amenities, for parsing URLs and labelling chips.
export async function searchRefs(): Promise<SearchRefs> {
  "use cache";
  cacheTag("listings");
  cacheLife("hours");
  const [areas, amenities] = await Promise.all([
    db.area.findMany({ where: { isActive: true }, select: { id: true, slug: true, nameEn: true, nameBn: true }, orderBy: { sortOrder: "asc" } }),
    db.amenity.findMany({ where: { isActive: true }, select: { id: true, slug: true, label: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  return { areas, amenities };
}

type WhereOptions = { skipAreas?: boolean; skipTypes?: boolean };

export function buildWhere(filters: SearchFilters, options: WhereOptions = {}): Prisma.ListingWhereInput {
  const and: Prisma.ListingWhereInput[] = [{ status: "PUBLISHED" }];
  if (!options.skipAreas && filters.areaIds.length > 0) and.push({ areaId: { in: filters.areaIds } });
  if (!options.skipTypes && filters.propertyTypes.length > 0) and.push({ propertyType: { in: filters.propertyTypes } });
  if (filters.minPrice !== null) and.push({ priceBdt: { gte: BigInt(filters.minPrice) } });
  if (filters.maxPrice !== null) and.push({ priceBdt: { lte: BigInt(filters.maxPrice) } });
  // A null `bedrooms` never matches `gte`, so plots drop out (AC-2).
  if (filters.minBedrooms !== null) and.push({ bedrooms: { gte: filters.minBedrooms } });
  for (const amenityId of filters.amenityIds) and.push({ amenities: { some: { amenityId } } });
  if (filters.refCode) and.push({ refCode: filters.refCode });
  // Prisma's `contains` passes `%` and `_` through as LIKE wildcards, so escape
  // them (and the escape character itself) to keep the keyword literal (AC-3).
  if (filters.titleQuery) {
    and.push({ title: { contains: likeLiteral(filters.titleQuery), mode: "insensitive" } });
  }
  return { AND: and };
}

// ---------------------------------------------------------------------------
// Cursors (AC-5, AC-6): `{ s, k, id }`, the sort, its key, and the tie breaker.

const cursorShape = z.object({ s: z.enum(["newest", "price-asc", "price-desc"]), k: z.string().max(40), id: z.uuid() });

function encodeCursor(sort: SearchSort, row: { id: string; publishedAt: Date | null; priceBdt: bigint | null }): string {
  const k = sort === "newest" ? (row.publishedAt ?? new Date(0)).toISOString() : String(row.priceBdt ?? 0);
  return Buffer.from(JSON.stringify({ s: sort, k, id: row.id })).toString("base64url");
}

// A cursor from another sort is ignored: the first page comes back.
function cursorWhere(sort: SearchSort, cursor: string | undefined): Prisma.ListingWhereInput | null {
  if (!cursor) return null;
  let parsed: z.infer<typeof cursorShape>;
  try {
    parsed = cursorShape.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
  } catch {
    return null;
  }
  if (parsed.s !== sort) return null;
  if (sort === "newest") {
    const at = new Date(parsed.k);
    if (Number.isNaN(at.getTime())) return null;
    return { OR: [{ publishedAt: { lt: at } }, { publishedAt: at, id: { lt: parsed.id } }] };
  }
  if (!/^\d+$/.test(parsed.k)) return null;
  const price = BigInt(parsed.k);
  return sort === "price-asc"
    ? { OR: [{ priceBdt: { gt: price } }, { priceBdt: price, id: { gt: parsed.id } }] }
    : { OR: [{ priceBdt: { lt: price } }, { priceBdt: price, id: { lt: parsed.id } }] };
}

const orderFor: Record<SearchSort, Prisma.ListingOrderByWithRelationInput[]> = {
  newest: [{ publishedAt: "desc" }, { id: "desc" }],
  "price-asc": [{ priceBdt: "asc" }, { id: "asc" }],
  "price-desc": [{ priceBdt: "desc" }, { id: "desc" }],
};

function lifeFor(filters: SearchFilters) {
  // Free text can create many entries, so keyword searches expire sooner.
  if (filters.titleQuery) cacheLife("minutes");
  else cacheLife("hours");
}

export async function searchListings(filters: SearchFilters, cursor?: string): Promise<{ items: SearchCard[]; nextCursor: string | null }> {
  "use cache";
  cacheTag("listings");
  lifeFor(filters);
  const where = buildWhere(filters);
  const after = cursorWhere(filters.sort, cursor);
  const rows = await db.listing.findMany({
    where: after ? { AND: [where, after] } : where,
    include: listingCardInclude,
    orderBy: orderFor[filters.sort],
    take: searchPageSize + 1,
  });
  const page = rows.slice(0, searchPageSize);
  const last = page.at(-1);
  return {
    items: page.map((row) => {
      const card = toCardDTO(serializeListing(row));
      return { ...card, pricePerSqft: card.builtUpSqft ? Math.round(card.priceBdt / card.builtUpSqft) : null };
    }),
    nextCursor: rows.length > searchPageSize && last ? encodeCursor(filters.sort, last) : null,
  };
}

export async function countListings(filters: SearchFilters): Promise<number> {
  "use cache";
  cacheTag("listings");
  lifeFor(filters);
  return db.listing.count({ where: buildWhere(filters) });
}

// AC-7: counts per area and per type, each ignoring its own filter.
export async function searchFacets(filters: SearchFilters): Promise<{ areas: Record<string, number>; types: Record<PropertyType, number> }> {
  "use cache";
  cacheTag("listings");
  lifeFor(filters);
  const [byArea, byType] = await Promise.all([
    db.listing.groupBy({ by: ["areaId"], where: buildWhere(filters, { skipAreas: true }), _count: { _all: true } }),
    db.listing.groupBy({ by: ["propertyType"], where: buildWhere(filters, { skipTypes: true }), _count: { _all: true } }),
  ]);
  const types = Object.fromEntries(propertyTypes.map((t) => [t, 0])) as Record<PropertyType, number>;
  for (const row of byType) types[row.propertyType as PropertyType] = row._count._all;
  return { areas: Object.fromEntries(byArea.map((row) => [row.areaId, row._count._all])), types };
}

// ---------------------------------------------------------------------------
// The search map (spec 0011, AC-1): every match up to the newest 500, ignoring
// sort and paging, plus the full count for the "Showing the newest 500" note.

export const mapPointLimit = 500;

export type MapPoint = Omit<SearchCard, "refCode" | "priceNegotiable" | "pricePerSqft"> & { lat: number; lng: number };

export async function searchMapPoints(filters: SearchFilters): Promise<{ points: MapPoint[]; total: number }> {
  "use cache";
  cacheTag("listings");
  lifeFor(filters);
  const where = buildWhere(filters);
  const [rows, total] = await Promise.all([
    db.listing.findMany({ where, include: listingCardInclude, orderBy: orderFor.newest, take: mapPointLimit }),
    db.listing.count({ where }),
  ]);
  return {
    // PUBLISHED rows always have a price and coordinates (spec 0005's check).
    points: rows.map((row) => {
      const card = toCardDTO(serializeListing(row));
      return {
        id: card.id,
        slug: card.slug,
        title: card.title,
        areaName: card.areaName,
        propertyType: card.propertyType,
        priceBdt: card.priceBdt,
        bedrooms: card.bedrooms,
        bathrooms: card.bathrooms,
        builtUpSqft: card.builtUpSqft,
        landKatha: card.landKatha,
        cover: card.cover,
        lat: row.latitude!,
        lng: row.longitude!,
      };
    }),
    total,
  };
}
