import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { PropertyType, ListingCardDTO } from "@/lib/domain/listing-card";
import { distanceKm, nearbyKm } from "@/lib/domain/match-score";
import type { Prisma } from "@/lib/generated/prisma/client";
import { db } from "@/lib/server/db";
import { listingCardInclude, listingDetailInclude, serializeListing, toCardDTO, type ListingDTO } from "@/lib/server/listings";
import { toKatha, toTaka } from "@/lib/server/money";
import { photoUrl } from "@/lib/server/photos";

// Public listing reads for the property page (spec 0009). Cached on first visit
// under spec 0005's tags, so an agent's change shows on the next request.

export type Advisor = { name: string; title: string | null; photoUrl: string | null; whatsapp: string | null };

export type PublicListing = Omit<ListingDTO, "photos"> & {
  photos: (ListingDTO["photos"][number] & { alt: string })[];
  pricePerSqft: number | null;
  advisor: Advisor | null;
};

export type PublicListingResult = { status: "PUBLISHED" | "SOLD"; listing: PublicListing } | null;

const agentSelect = {
  select: { fullName: true, agentTitle: true, agentPhotoUrl: true, agentWhatsapp: true, agentIsPublic: true, deletedAt: true },
} as const;

const publicInclude = { ...listingDetailInclude, assignedAgent: agentSelect } satisfies Prisma.ListingInclude;

type Row = Prisma.ListingGetPayload<{ include: typeof publicInclude }>;

// AC-6: only a public, active agent is named.
function advisorOf(agent: Row["assignedAgent"]): Advisor | null {
  if (!agent || !agent.agentIsPublic || agent.deletedAt || !agent.fullName?.trim()) return null;
  const digits = agent.agentWhatsapp?.replace(/\D/g, "") || null;
  return { name: agent.fullName.trim(), title: agent.agentTitle, photoUrl: agent.agentPhotoUrl, whatsapp: digits };
}

// AC-4: the cover first, then the rest by `sort_order`; empty alt text gets a name.
function orderedPhotos(dto: ListingDTO) {
  const photos = [...dto.photos].sort((a, b) => Number(b.isCover) - Number(a.isCover));
  return photos.map((photo, i) => ({ ...photo, alt: photo.alt.trim() || `${dto.title}, photo ${i + 1}` }));
}

function toPublic(row: Row): PublicListing {
  const dto = serializeListing(row);
  return {
    ...dto,
    photos: orderedPhotos(dto),
    pricePerSqft: dto.builtUpSqft ? Math.round(dto.priceBdt / dto.builtUpSqft) : null,
    advisor: advisorOf(row.assignedAgent),
  };
}

export async function getPublicListing(slug: string): Promise<PublicListingResult> {
  "use cache";
  cacheTag("listings");
  const row = slug.length <= 200 ? await db.listing.findUnique({ where: { slug }, include: publicInclude }) : null;
  if (!row || (row.status !== "PUBLISHED" && row.status !== "SOLD")) {
    // Not cached for long, so random slugs can't fill the cache and a newly
    // published slug appears at once (spec 0009).
    cacheLife("seconds");
    return null;
  }
  cacheTag(`listing:${row.id}`);
  cacheLife("days");
  try {
    return { status: row.status, listing: toPublic(row) };
  } catch {
    // A sold listing missing a public field (cleared while unpublished) can't be shown.
    cacheLife("seconds");
    return null;
  }
}

// ---------------------------------------------------------------------------
// Similar homes (AC-5): same type, within 25% of the price, same area first,
// then within 3 km, then the rest; closest price, then newest, within each.

export type SimilarCard = ListingCardDTO & { pricePerSqft: number | null };

export async function getSimilarListings(id: string, propertyType: PropertyType, areaId: string, priceBdt: number): Promise<SimilarCard[]> {
  "use cache";
  cacheTag("listings");
  cacheLife("hours");
  const low = BigInt(Math.floor(priceBdt * 0.75));
  const high = BigInt(Math.ceil(priceBdt * 1.25));
  const [rows, areas] = await Promise.all([
    db.listing.findMany({
      where: { status: "PUBLISHED", propertyType, id: { not: id }, priceBdt: { gte: low, lte: high } },
      include: listingCardInclude,
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: 50,
    }),
    db.area.findMany({ select: { id: true, centerLat: true, centerLng: true } }),
  ]);
  const centers = new Map(areas.map((a) => [a.id, { lat: a.centerLat, lng: a.centerLng }]));
  const home = centers.get(areaId);
  const group = (otherArea: string) => {
    if (otherArea === areaId) return 0;
    const other = centers.get(otherArea);
    return home && other && distanceKm(home, other) <= nearbyKm ? 1 : 2;
  };
  return rows
    .map((row, newest) => ({ row, group: group(row.areaId), gap: Math.abs(toTaka(row.priceBdt!) - priceBdt), newest }))
    .sort((a, b) => a.group - b.group || a.gap - b.gap || a.newest - b.newest)
    .slice(0, 3)
    .map(({ row }) => {
      const card = toCardDTO(serializeListing(row));
      return { ...card, pricePerSqft: card.builtUpSqft ? Math.round(card.priceBdt / card.builtUpSqft) : null };
    });
}

// ---------------------------------------------------------------------------
// Agent preview (AC-10): any status, never cached, tolerant of empty fields.

export type PreviewListing = {
  id: string;
  slug: string;
  refCode: string;
  status: string;
  propertyType: PropertyType;
  title: string;
  description: string | null;
  priceBdt: number | null;
  priceNegotiable: boolean;
  area: { nameEn: string };
  addressLine: string | null;
  latitude: number | null;
  longitude: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  builtUpSqft: number | null;
  landKatha: number | null;
  floorNumber: number | null;
  totalFloors: number | null;
  parkingSpaces: number | null;
  completionStatus: "READY" | "UNDER_CONSTRUCTION" | null;
  handoverDate: string | null;
  amenities: { id: string; label: string }[];
  photos: { id: string; url: string; alt: string; width: number | null; height: number | null; isCover: boolean }[];
  pricePerSqft: number | null;
  advisor: Advisor | null;
};

export async function getListingPreview(id: string): Promise<PreviewListing | null> {
  const row = await db.listing.findUnique({ where: { id }, include: publicInclude }).catch(() => null);
  if (!row) return null;
  const price = row.priceBdt === null ? null : toTaka(row.priceBdt);
  const photos = [...row.photos]
    .sort((a, b) => Number(b.isCover) - Number(a.isCover))
    .map((p, i) => ({ id: p.id, url: photoUrl(p), alt: p.alt.trim() || `${row.title}, photo ${i + 1}`, width: p.width, height: p.height, isCover: p.isCover }));
  return {
    id: row.id,
    slug: row.slug,
    refCode: row.refCode,
    status: row.status,
    propertyType: row.propertyType as PropertyType,
    title: row.title,
    description: row.description,
    priceBdt: price,
    priceNegotiable: row.priceNegotiable,
    area: { nameEn: row.area.nameEn },
    addressLine: row.addressLine,
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
    amenities: row.amenities.map(({ amenity }) => ({ id: amenity.id, label: amenity.label })),
    photos,
    pricePerSqft: price !== null && row.builtUpSqft ? Math.round(price / row.builtUpSqft) : null,
    advisor: advisorOf(row.assignedAgent),
  };
}
