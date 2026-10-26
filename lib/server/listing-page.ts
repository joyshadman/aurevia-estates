import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { ListingCardDTO } from "@/lib/domain/listing-card";
import { db } from "@/lib/server/db";
import { listingCardInclude, listingDetailInclude, serializeListing, toCardDTO, type ListingDTO } from "@/lib/server/listings";
import { advisorName } from "@/lib/server/viewing-cards";

// The public property page's read (spec 0012). Cached and tagged with the
// listing's own tag and `listings`, which spec 0005's agent actions refresh,
// so an edit or unpublish shows on the next load (AC-5).

const similarShown = 3;
const similarCandidates = 40;

export type ListingPage = { listing: ListingDTO; advisor: string; similar: ListingCardDTO[] };

export async function publishedSlugs(): Promise<string[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("listings");
  const rows = await db.listing.findMany({ where: { status: "PUBLISHED" }, select: { slug: true } });
  return rows.map((row) => row.slug);
}

// The sitemap's listing entries (spec 0016, AC-1, AC-4).
export async function sitemapListings(): Promise<{ slug: string; updatedAt: Date }[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("listings");
  return db.listing.findMany({
    where: { status: "PUBLISHED" },
    select: { slug: true, updatedAt: true },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
  });
}

// Null for an unknown slug or any status but PUBLISHED (AC-1).
export async function listingPage(slug: string): Promise<ListingPage | null> {
  "use cache";
  cacheLife("hours");
  cacheTag("listings");
  const row = await db.listing.findFirst({
    where: { slug, status: "PUBLISHED" },
    include: { ...listingDetailInclude, assignedAgent: { select: { fullName: true, agentIsPublic: true, deletedAt: true } } },
  });
  if (!row) return null;
  cacheTag(`listing:${row.id}`);
  const listing = serializeListing(row);

  // "You may also consider": the same type or area, closest in price first.
  const candidates = await db.listing.findMany({
    where: { status: "PUBLISHED", id: { not: row.id }, OR: [{ propertyType: row.propertyType }, { areaId: row.areaId }] },
    include: listingCardInclude,
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: similarCandidates,
  });
  const similar = candidates
    .map((candidate) => toCardDTO(serializeListing(candidate)))
    .sort((a, b) => Math.abs(a.priceBdt - listing.priceBdt) - Math.abs(b.priceBdt - listing.priceBdt))
    .slice(0, similarShown);

  return { listing, advisor: advisorName(row.assignedAgent), similar };
}
