import "server-only";
import type { ListingCardDTO } from "@/lib/domain/listing-card";
import type { Actor } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { listingCardInclude, serializeListing, toCardDTO } from "@/lib/server/listings";

// Saved homes (spec 0014). Hearts identify a home by its slug, which every
// public card already carries.

const maxSaved = 500;

// What the hearts on a page read once (spec 0014, *Public pages stay cacheable*).
export async function savedSlugs(actor: Actor): Promise<string[]> {
  const rows = await db.savedHome.findMany({
    where: { profileId: actor.id },
    select: { listing: { select: { slug: true } } },
    orderBy: { createdAt: "desc" },
    take: maxSaved,
  });
  return rows.map((row) => row.listing.slug);
}

// Only a published home can be saved; saving twice is a no op.
export async function saveHome(actor: Actor, slug: string): Promise<{ ok: true } | { ok: false; reason: "unavailable" }> {
  const listing = await db.listing.findFirst({ where: { slug, status: "PUBLISHED" }, select: { id: true } });
  if (!listing) return { ok: false, reason: "unavailable" };
  await db.$executeRaw`
    INSERT INTO saved_homes (profile_id, listing_id, created_at)
    VALUES (${actor.id}::uuid, ${listing.id}::uuid, now())
    ON CONFLICT (profile_id, listing_id) DO NOTHING`;
  return { ok: true };
}

// Unsaving always works, published or not.
export async function unsaveHome(actor: Actor, slug: string): Promise<void> {
  await db.savedHome.deleteMany({ where: { profileId: actor.id, listing: { slug } } });
}

export type SavedHome = { card: ListingCardDTO; available: boolean; savedAt: string };

// AC-3: newest saved first; a home no longer published says so.
export async function listSavedHomes(actor: Actor): Promise<SavedHome[]> {
  const rows = await db.savedHome.findMany({
    where: { profileId: actor.id },
    orderBy: { createdAt: "desc" },
    take: maxSaved,
    select: { createdAt: true, listing: { include: listingCardInclude } },
  });
  return rows.map((row): SavedHome => {
    const savedAt = row.createdAt.toISOString();
    if (row.listing.status === "PUBLISHED") return { card: toCardDTO(serializeListing(row.listing)), available: true, savedAt };
    // An unpublished listing may lack the fields the card mapper needs, so it
    // shows as a title only.
    const card: ListingCardDTO = {
      slug: row.listing.slug,
      refCode: row.listing.refCode,
      title: row.listing.title,
      areaName: row.listing.area.nameEn,
      propertyType: row.listing.propertyType as ListingCardDTO["propertyType"],
      priceBdt: 0,
      priceNegotiable: false,
      bedrooms: null,
      bathrooms: null,
      builtUpSqft: null,
      landKatha: null,
      cover: null,
    };
    return { card, available: false, savedAt };
  });
}
