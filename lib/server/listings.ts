import "server-only";
import { z } from "zod";
import { propertyTypes, type ListingCardDTO, type PropertyType } from "@/lib/domain/listing-card";
import {
  areasWithinReach,
  budgetSlack,
  type BriefCriteria,
  type ScoreContext,
  type ScoredListing,
} from "@/lib/domain/match-score";
import { listingSlug, refCodeFor } from "@/lib/domain/slug";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { Actor } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { transitionListing } from "@/lib/server/listing-status";
import { toKatha, toTaka } from "@/lib/server/money";
import { photoUrl } from "@/lib/server/photos";

// Shared listing server code (spec 0002): refs, publishing, search, and the one
// mapper that turns a row into plain JSON.

type Db = Pick<Prisma.TransactionClient, "$queryRaw">;

// Reads the next ref from `listing_ref_seq`. Call it inside the create transaction.
export async function nextListingRef(title: string, client: Db = db) {
  const [{ n }] = await client.$queryRaw<{ n: bigint }[]>`SELECT nextval('listing_ref_seq') AS n`;
  const refCode = refCodeFor(n);
  return { refCode, slug: listingSlug(title, refCode) };
}

// Publish preconditions (cover, location, type fields) are checked inside
// `transitionListing`, in the same transaction as the status change.
export async function publishListing(id: string, actor: Actor, tx?: Prisma.TransactionClient) {
  return transitionListing(id, "PUBLISHED", actor, tx);
}

// Price, address, and description may be empty on a draft (spec 0005). The
// database check guarantees them on every PUBLISHED row, and these readers only
// serve published listings, so a null here is a bug, not a state to render.
export function publishedValue<T>(value: T | null, listingId: string, field: string): T {
  if (value === null) throw new Error(`Listing ${listingId} has no ${field}; only complete listings may be shown`);
  return value;
}

// ---------------------------------------------------------------------------
// Serialization: `bigint` and `Decimal` never leave the server.

export const listingDetailInclude = {
  area: true,
  photos: { orderBy: { sortOrder: "asc" } },
  amenities: { include: { amenity: true }, orderBy: { amenity: { sortOrder: "asc" } } },
} satisfies Prisma.ListingInclude;

export const listingCardInclude = {
  area: true,
  photos: { where: { isCover: true }, take: 1 },
} satisfies Prisma.ListingInclude;

type ListingRow = Prisma.ListingGetPayload<{ include: typeof listingCardInclude }> & {
  amenities?: Prisma.ListingAmenityGetPayload<{ include: { amenity: true } }>[];
};

export function serializeListing(row: ListingRow) {
  const photos = row.photos.map((photo) => ({
    id: photo.id,
    url: photoUrl(photo),
    alt: photo.alt,
    width: photo.width,
    height: photo.height,
    isCover: photo.isCover,
  }));
  const cover = photos.find((photo) => photo.isCover) ?? null;
  return {
    id: row.id,
    slug: row.slug,
    refCode: row.refCode,
    status: row.status,
    dealType: row.dealType,
    propertyType: row.propertyType as PropertyType,
    title: row.title,
    description: publishedValue(row.description, row.id, "description"),
    priceBdt: toTaka(publishedValue(row.priceBdt, row.id, "price")),
    priceNegotiable: row.priceNegotiable,
    area: { id: row.area.id, slug: row.area.slug, nameEn: row.area.nameEn, nameBn: row.area.nameBn },
    addressLine: publishedValue(row.addressLine, row.id, "address"),
    latitude: row.latitude,
    longitude: row.longitude,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    builtUpSqft: row.builtUpSqft,
    landKatha: toKatha(row.landKatha),
    floorNumber: row.floorNumber,
    totalFloors: row.totalFloors,
    parkingSpaces: row.parkingSpaces,
    completionStatus: row.completionStatus,
    handoverDate: row.handoverDate?.toISOString().slice(0, 10) ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    assignedAgentId: row.assignedAgentId,
    amenities: (row.amenities ?? []).map(({ amenity }) => ({
      id: amenity.id,
      slug: amenity.slug,
      label: amenity.label,
      labelBn: amenity.labelBn,
      icon: amenity.icon,
    })),
    photos,
    cover: cover && { url: cover.url, alt: cover.alt },
  };
}

export type ListingDTO = ReturnType<typeof serializeListing>;

export function toCardDTO(listing: ListingDTO): ListingCardDTO {
  return {
    slug: listing.slug,
    refCode: listing.refCode,
    title: listing.title,
    areaName: listing.area.nameEn,
    propertyType: listing.propertyType,
    priceBdt: listing.priceBdt,
    priceNegotiable: listing.priceNegotiable,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    builtUpSqft: listing.builtUpSqft,
    landKatha: listing.landKatha,
    cover: listing.cover,
  };
}

// ---------------------------------------------------------------------------
// Search (AC-6). Keyset paging on (published_at desc, id desc).

const cursorShape = z.object({ publishedAt: z.iso.datetime(), id: z.uuid() });

export function encodeCursor(row: { publishedAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ publishedAt: row.publishedAt.toISOString(), id: row.id })).toString("base64url");
}

function decodeCursor(cursor: string) {
  try {
    return cursorShape.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
  } catch {
    return null;
  }
}

const taka = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const searchFilters = z
  .object({
    areaIds: z.array(z.uuid()).max(20).optional(),
    propertyTypes: z.array(z.enum(propertyTypes)).max(propertyTypes.length).optional(),
    minPrice: taka.optional(),
    maxPrice: taka.optional(),
    minBedrooms: z.number().int().min(0).max(50).optional(),
    amenityIds: z.array(z.uuid()).max(20).optional(),
    cursor: z
      .string()
      .max(200)
      .refine((value) => decodeCursor(value) !== null, { message: "Invalid cursor" })
      .optional(),
    limit: z.number().int().min(1).max(24).default(12),
  })
  .refine((f) => f.minPrice === undefined || f.maxPrice === undefined || f.minPrice <= f.maxPrice, {
    message: "minPrice must not exceed maxPrice",
    path: ["minPrice"],
  });

export type SearchFilters = z.input<typeof searchFilters>;

export async function searchPublishedListings(input: SearchFilters) {
  const filters = searchFilters.parse(input);
  const and: Prisma.ListingWhereInput[] = [{ status: "PUBLISHED" }];

  if (filters.areaIds?.length) and.push({ areaId: { in: filters.areaIds } });
  if (filters.propertyTypes?.length) and.push({ propertyType: { in: filters.propertyTypes } });
  if (filters.minPrice !== undefined) and.push({ priceBdt: { gte: BigInt(filters.minPrice) } });
  if (filters.maxPrice !== undefined) and.push({ priceBdt: { lte: BigInt(filters.maxPrice) } });
  // A null `bedrooms` never matches `gte`, so plots drop out of a bedroom filter.
  if (filters.minBedrooms !== undefined) and.push({ bedrooms: { gte: filters.minBedrooms } });
  // Every chosen amenity must be present: one `some` clause each.
  for (const amenityId of new Set(filters.amenityIds ?? [])) and.push({ amenities: { some: { amenityId } } });

  const cursor = filters.cursor ? decodeCursor(filters.cursor) : null;
  if (cursor) {
    const publishedAt = new Date(cursor.publishedAt);
    and.push({ OR: [{ publishedAt: { lt: publishedAt } }, { publishedAt, id: { lt: cursor.id } }] });
  }

  const rows = await db.listing.findMany({
    where: { AND: and },
    include: listingCardInclude,
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: filters.limit + 1,
  });

  const page = rows.slice(0, filters.limit);
  const last = page.at(-1);
  const nextCursor =
    rows.length > filters.limit && last?.publishedAt ? encodeCursor({ publishedAt: last.publishedAt, id: last.id }) : null;

  return { items: page.map((row) => toCardDTO(serializeListing(row))), nextCursor };
}

// ---------------------------------------------------------------------------
// Assistant candidates (spec 0006). Wider than the brief, so close matches can
// fill in: budget stretches by 15%, areas reach 3 km, bedrooms one fewer, and
// amenities never filter. The match score ranks what comes back.

export const candidateCap = 200;

export async function loadScoreContext(): Promise<ScoreContext> {
  const [areas, amenities] = await Promise.all([
    db.area.findMany({ select: { id: true, nameEn: true, centerLat: true, centerLng: true } }),
    db.amenity.findMany({ select: { id: true, label: true } }),
  ]);
  return {
    areas: new Map(areas.map(({ id, ...area }) => [id, area])),
    amenityLabels: new Map(amenities.map((amenity) => [amenity.id, amenity.label])),
  };
}

function candidateWhere(brief: BriefCriteria, context: ScoreContext): Prisma.ListingWhereInput {
  const and: Prisma.ListingWhereInput[] = [{ status: "PUBLISHED" }];
  if (brief.propertyTypes.length > 0) and.push({ propertyType: { in: brief.propertyTypes } });
  if (brief.budgetMaxBdt !== null) {
    and.push({ priceBdt: { lte: BigInt(Math.floor(brief.budgetMaxBdt * (1 + budgetSlack))) } });
  }
  if (brief.budgetMinBdt !== null) {
    and.push({ priceBdt: { gte: BigInt(Math.ceil(brief.budgetMinBdt * (1 - budgetSlack))) } });
  }
  if (brief.areaIds.length > 0) and.push({ areaId: { in: areasWithinReach(brief.areaIds, context.areas) } });
  // A null `bedrooms` never matches `gte`, so plots drop out of a bedroom brief.
  if (brief.minBedrooms !== null) and.push({ bedrooms: { gte: brief.minBedrooms - 1 } });
  return { AND: and };
}

export async function searchCandidateListings(brief: BriefCriteria, context: ScoreContext): Promise<ScoredListing[]> {
  const rows = await db.listing.findMany({
    where: candidateWhere(brief, context),
    select: {
      id: true,
      refCode: true,
      propertyType: true,
      priceBdt: true,
      areaId: true,
      bedrooms: true,
      publishedAt: true,
      amenities: { select: { amenityId: true } },
    },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: candidateCap,
  });
  return rows.map((row) => ({
    id: row.id,
    refCode: row.refCode,
    propertyType: row.propertyType as PropertyType,
    priceBdt: toTaka(publishedValue(row.priceBdt, row.id, "price")),
    areaId: row.areaId,
    bedrooms: row.bedrooms,
    amenityIds: row.amenities.map(({ amenityId }) => amenityId),
    publishedAt: row.publishedAt,
  }));
}

export async function countCandidateListings(brief: BriefCriteria, context: ScoreContext): Promise<number> {
  return db.listing.count({ where: candidateWhere(brief, context) });
}
