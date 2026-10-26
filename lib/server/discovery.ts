import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { DiscoveryQuery } from "@/lib/domain/discovery";
import { discoveryPageSize } from "@/lib/domain/discovery";
import { normalizeRefCode, type ListingCardDTO } from "@/lib/domain/listing-card";
import type { Prisma } from "@/lib/generated/prisma/client";
import { db } from "@/lib/server/db";
import { listingCardInclude, serializeListing, toCardDTO } from "@/lib/server/listings";

// The public discovery page's reads (spec 0010). Cached and tagged `listings`,
// which every listing write already refreshes (spec 0005), so the page reads no
// cookies and a publish shows on the next load (AC-7). Its own file, so the
// eval's imports of `listings.ts` stay Next free.

export type DiscoveryOptions = {
  areas: { slug: string; name: string; count: number }[];
  amenities: { slug: string; label: string }[];
  total: number;
};

// The filter panel: active areas with their published counts, active amenities.
export async function discoveryOptions(): Promise<DiscoveryOptions> {
  "use cache";
  cacheLife("hours");
  cacheTag("listings");
  const [areas, counts, amenities] = await Promise.all([
    db.area.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, slug: true, nameEn: true } }),
    db.listing.groupBy({ by: ["areaId"], where: { status: "PUBLISHED" }, _count: true }),
    db.amenity.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { slug: true, label: true } }),
  ]);
  const countFor = new Map(counts.map((row) => [row.areaId, row._count]));
  return {
    areas: areas.map((area) => ({ slug: area.slug, name: area.nameEn, count: countFor.get(area.id) ?? 0 })),
    amenities,
    total: counts.reduce((sum, row) => sum + row._count, 0),
  };
}

const orderBy: Record<DiscoveryQuery["sort"], Prisma.ListingOrderByWithRelationInput[]> = {
  newest: [{ publishedAt: "desc" }, { id: "desc" }],
  price_asc: [{ priceBdt: "asc" }, { publishedAt: "desc" }, { id: "desc" }],
  price_desc: [{ priceBdt: "desc" }, { publishedAt: "desc" }, { id: "desc" }],
};

// AC-1, AC-2, AC-4. Filters combine with AND; areas and types match any chosen
// value, amenities all of them. The page drops slugs the options don't know first.
export async function discoverListings(query: DiscoveryQuery): Promise<{ items: ListingCardDTO[]; total: number }> {
  "use cache";
  cacheLife("hours");
  cacheTag("listings");
  const where = whereFor(query);
  const [total, rows] = await Promise.all([
    db.listing.count({ where }),
    db.listing.findMany({
      where,
      include: listingCardInclude,
      orderBy: orderBy[query.sort],
      skip: (query.page - 1) * discoveryPageSize,
      take: discoveryPageSize,
    }),
  ]);
  return { items: rows.map((row) => toCardDTO(serializeListing(row))), total };
}

export type MapPin = {
  slug: string;
  title: string;
  areaName: string;
  priceBdt: number;
  latitude: number;
  longitude: number;
  cover: ListingCardDTO["cover"];
};

const maxPins = 300;

// Spec 0013, AC-1: every match as a pin, no paging, same filters as the list.
export async function discoverMapPins(query: DiscoveryQuery): Promise<{ pins: MapPin[]; total: number }> {
  "use cache";
  cacheLife("hours");
  cacheTag("listings");
  const where = { AND: [whereFor(query), { latitude: { not: null } }, { longitude: { not: null } }] };
  const [total, rows] = await Promise.all([
    db.listing.count({ where: whereFor(query) }),
    db.listing.findMany({ where, include: listingCardInclude, orderBy: orderBy[query.sort], take: maxPins }),
  ]);
  return {
    pins: rows.map((row) => {
      const card = toCardDTO(serializeListing(row));
      return {
        slug: card.slug,
        title: card.title,
        areaName: card.areaName,
        priceBdt: card.priceBdt,
        latitude: row.latitude!,
        longitude: row.longitude!,
        cover: card.cover,
      };
    }),
    total,
  };
}

function whereFor(query: DiscoveryQuery): Prisma.ListingWhereInput {
  const { areas, amenities } = query;
  const and: Prisma.ListingWhereInput[] = [{ status: "PUBLISHED" }];
  if (query.q) {
    and.push({
      OR: [
        { title: { contains: query.q, mode: "insensitive" } },
        { area: { nameEn: { contains: query.q, mode: "insensitive" } } },
        { refCode: normalizeRefCode(query.q) },
      ],
    });
  }
  if (areas.length > 0) and.push({ area: { slug: { in: areas } } });
  if (query.types.length > 0) and.push({ propertyType: { in: query.types } });
  if (query.min !== null) and.push({ priceBdt: { gte: BigInt(query.min) } });
  if (query.max !== null) and.push({ priceBdt: { lte: BigInt(query.max) } });
  // A null `bedrooms` never matches `gte`, so plots and commercial drop out.
  if (query.beds !== null) and.push({ bedrooms: { gte: query.beds } });
  for (const slug of amenities) and.push({ amenities: { some: { amenity: { slug } } } });
  return { AND: and };
}
