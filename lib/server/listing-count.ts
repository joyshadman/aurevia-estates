import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/lib/server/db";

// "Searching N verified listings" in the chat header (spec 0006, *Routes and
// pages*). Cached and tagged `listings`, which listing writes refresh (spec
// 0005). Its own file, so the eval's imports of `listings.ts` stay Next free.
export async function publishedListingCount(): Promise<number> {
  "use cache";
  cacheLife("hours");
  cacheTag("listings");
  return db.listing.count({ where: { status: "PUBLISHED" } });
}
