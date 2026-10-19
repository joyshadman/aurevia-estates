import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/lib/server/db";

// "Searching N verified listings" (spec 0006): cached, tagged `listings`, so
// spec 0005's listing actions refresh it with `updateTag("listings")`.
export async function publishedListingCount() {
  "use cache";
  cacheTag("listings");
  cacheLife("hours");
  return db.listing.count({ where: { status: "PUBLISHED" } });
}
