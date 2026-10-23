import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { Actor } from "@/lib/server/auth";
import { ForbiddenError, LastCoverError, NotFoundError } from "@/lib/server/errors";
import { ownsListing } from "@/lib/server/listing-status";
import { inTransaction } from "@/lib/server/tx";

// Listing photos (spec 0002, AC-4). The database allows one cover per listing;
// these functions keep a PUBLISHED listing from ever losing its cover.

// The display URL: a pasted link as is. Uploaded objects lived in the old
// provider's storage, which is gone (spec 0008, AC-16); photos stored in Neon arrive with
// feature 20 (spec 0001). The fresh Neon database has no `storage_path` rows.
export function photoUrl(photo: { url: string | null; storagePath: string | null }): string {
  if (photo.url) return photo.url;
  if (photo.storagePath) throw new Error("Uploaded photos are not served until feature 20 (spec 0008, AC-16)");
  throw new Error("Photo has neither url nor storage_path");
}

// Loads the photo and locks its listing row, so cover changes on one listing run
// one at a time.
async function lockPhoto(tx: Prisma.TransactionClient, photoId: string, actor: Actor) {
  const photo = await tx.listingPhoto.findUnique({ where: { id: photoId } });
  if (!photo) throw new NotFoundError("photo", photoId);
  await tx.$executeRaw`SELECT 1 FROM listings WHERE id = ${photo.listingId}::uuid FOR UPDATE`;
  const listing = await tx.listing.findUniqueOrThrow({ where: { id: photo.listingId } });
  if (actor.role !== "AGENT" || !ownsListing(listing, actor)) throw new ForbiddenError();
  return { photo, listing };
}

// Pass `tx` to run inside a caller's transaction (spec 0005 photo actions).
export async function setCover(photoId: string, actor: Actor, tx?: Prisma.TransactionClient) {
  return inTransaction(tx, async (tx) => {
    const { photo } = await lockPhoto(tx, photoId, actor);
    if (photo.isCover) return photo;
    // Demote first: the one cover index is not deferrable.
    await tx.listingPhoto.updateMany({ where: { listingId: photo.listingId, isCover: true }, data: { isCover: false } });
    return tx.listingPhoto.update({ where: { id: photoId }, data: { isCover: true } });
  });
}

export async function deletePhoto(photoId: string, actor: Actor, tx?: Prisma.TransactionClient) {
  return inTransaction(tx, async (tx) => {
    const { photo, listing } = await lockPhoto(tx, photoId, actor);
    if (photo.isCover && listing.status === "PUBLISHED") throw new LastCoverError();
    return tx.listingPhoto.delete({ where: { id: photoId } });
  });
}
