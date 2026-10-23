import "server-only";
import type { ListingCardDTO } from "@/lib/domain/listing-card";
import { db } from "@/lib/server/db";
import { listingCardInclude, serializeListing, toCardDTO } from "@/lib/server/listings";

// Current data for the cards a chat shows (spec 0006, *Rendering*, AC-18): the
// photo, price, and chips come from the listing as it is now, never from the
// stored tool output. A listing that is no longer PUBLISHED is "No longer
// available", with no actions.

export type ChatCard = { available: true; card: ListingCardDTO } | { available: false };

export const maxCardsPerLoad = 300;

export async function chatCards(listingIds: string[]): Promise<Record<string, ChatCard>> {
  const ids = [...new Set(listingIds)].slice(0, maxCardsPerLoad);
  if (ids.length === 0) return {};
  const rows = await db.listing.findMany({ where: { id: { in: ids } }, include: listingCardInclude });
  const byId: Record<string, ChatCard> = {};
  for (const row of rows) {
    byId[row.id] = row.status === "PUBLISHED" ? { available: true, card: toCardDTO(serializeListing(row)) } : { available: false };
  }
  // A deleted listing reads as unavailable too.
  for (const id of ids) byId[id] ??= { available: false };
  return byId;
}
