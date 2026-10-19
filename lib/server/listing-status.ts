import "server-only";
import { typeRuleIssues } from "@/lib/domain/listing-schema";
import { assertListingTransition } from "@/lib/domain/listing-status";
import type { ListingStatus, Prisma } from "@/lib/generated/prisma/client";
import { ForbiddenError, type Actor } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { NotFoundError, PublishBlockedError, StaleStatusError } from "@/lib/server/errors";

// The only writer of `listings.status` (spec 0002, AC-11).

export function ownsListing(listing: { createdById: string; assignedAgentId: string | null }, actor: Actor) {
  return listing.createdById === actor.id || listing.assignedAgentId === actor.id;
}

// What still blocks publishing (AC-3): cover photo, coordinates, the type's fields.
async function publishBlockers(tx: Prisma.TransactionClient, listingId: string): Promise<string[]> {
  const listing = await tx.listing.findUniqueOrThrow({
    where: { id: listingId },
    include: { photos: { where: { isCover: true }, select: { id: true } } },
  });
  const missing: string[] = [];
  if (listing.photos.length === 0) missing.push("cover photo");
  if (listing.latitude === null || listing.longitude === null) missing.push("map location");
  for (const issue of typeRuleIssues(listing.propertyType, listing)) missing.push(`${issue.field}: ${issue.message}`);
  return missing;
}

// Runs in the caller's transaction when given one (spec 0005: save then publish
// under one row lock), else in its own.
export async function transitionListing(id: string, to: ListingStatus, actor: Actor, client?: Prisma.TransactionClient) {
  const run = async (tx: Prisma.TransactionClient) => {
    const listing = await tx.listing.findUnique({ where: { id } });
    if (!listing) throw new NotFoundError("listing", id);

    const { review } = assertListingTransition(listing.status, to, actor);
    if (!review && !ownsListing(listing, actor)) throw new ForbiddenError();

    const data: Prisma.ListingUpdateManyMutationInput & { assignedAgentId?: string } = { status: to };
    if (to === "PUBLISHED") {
      // Same lock as `deletePhoto`, so the cover cannot vanish mid publish.
      await tx.$executeRaw`SELECT 1 FROM listings WHERE id = ${id}::uuid FOR UPDATE`;
      const missing = await publishBlockers(tx, id);
      if (missing.length > 0) throw new PublishBlockedError(missing);
      // App side millisecond Date, so search cursors round trip exactly.
      if (!listing.publishedAt) data.publishedAt = new Date();
      if (!listing.assignedAgentId) data.assignedAgentId = actor.id;
    }
    if (to === "SOLD") data.soldAt = new Date();

    const { count } = await tx.listing.updateMany({ where: { id, status: listing.status }, data });
    if (count === 0) throw new StaleStatusError("listing", id);
    return tx.listing.findUniqueOrThrow({ where: { id } });
  };
  return client ? run(client) : db.$transaction(run);
}
