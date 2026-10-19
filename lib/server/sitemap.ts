import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/lib/server/db";
import { photoUrl } from "@/lib/server/photos";

// Sitemap data (spec 0015): PUBLISHED listings only, never SOLD, and the areas
// that have at least one. Cached under `listings`, which every public change
// updates (spec 0005).

export type SitemapData = {
  listings: { slug: string; updatedAt: string; cover: string | null }[];
  areas: { slug: string; updatedAt: string }[];
};

export async function sitemapData(): Promise<SitemapData> {
  "use cache";
  cacheTag("listings");
  cacheLife("hours");
  const rows = await db.listing.findMany({
    where: { status: "PUBLISHED" },
    select: { slug: true, updatedAt: true, area: { select: { slug: true } }, photos: { where: { isCover: true }, take: 1 } },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: 50_000 - 100,
  });
  const areas = new Map<string, Date>();
  for (const row of rows) {
    const latest = areas.get(row.area.slug);
    if (!latest || latest < row.updatedAt) areas.set(row.area.slug, row.updatedAt);
  }
  return {
    listings: rows.map((row) => ({ slug: row.slug, updatedAt: row.updatedAt.toISOString(), cover: row.photos[0] ? photoUrl(row.photos[0]) : null })),
    areas: [...areas].map(([slug, updatedAt]) => ({ slug, updatedAt: updatedAt.toISOString() })).sort((a, b) => a.slug.localeCompare(b.slug)),
  };
}
