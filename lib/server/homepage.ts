import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { ListingCardDTO, PropertyType } from "@/lib/domain/listing-card";
import { db } from "@/lib/server/db";
import { listingCardInclude, serializeListing, toCardDTO } from "@/lib/server/listings";
import { toTaka } from "@/lib/server/money";

// The homepage's live data (spec 0011). One cached read tagged `listings`,
// which listing writes already refresh (spec 0005), so `/` reads no cookies
// (AC-5) and every number on it comes from the database (AC-4).

const newestShown = 6;
const categoriesShown = 4;

export type HomepageCategory = { type: PropertyType; count: number; fromBdt: number; cover: ListingCardDTO["cover"] };

export type HomepageData = {
  newest: ListingCardDTO[];
  categories: HomepageCategory[];
  stats: { homes: number; neighbourhoods: number; fromBdt: number | null };
};

export async function homepageData(): Promise<HomepageData> {
  "use cache";
  cacheLife("hours");
  cacheTag("listings");
  const published = { status: "PUBLISHED" as const };
  const [rows, byType, areas, cheapest] = await Promise.all([
    db.listing.findMany({ where: published, include: listingCardInclude, orderBy: [{ publishedAt: "desc" }, { id: "desc" }], take: newestShown }),
    db.listing.groupBy({ by: ["propertyType"], where: published, _count: true, _min: { priceBdt: true } }),
    db.listing.groupBy({ by: ["areaId"], where: published }),
    db.listing.aggregate({ where: published, _min: { priceBdt: true }, _count: true }),
  ]);

  // Most listed types first; each tile shows its newest listing's cover.
  const top = byType.sort((a, b) => b._count - a._count).slice(0, categoriesShown);
  const covers = await Promise.all(
    top.map((group) =>
      db.listing.findFirst({
        where: { ...published, propertyType: group.propertyType },
        include: listingCardInclude,
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      }),
    ),
  );

  return {
    newest: rows.map((row) => toCardDTO(serializeListing(row))),
    categories: top.map((group, index) => ({
      type: group.propertyType as PropertyType,
      count: group._count,
      fromBdt: group._min.priceBdt === null ? 0 : toTaka(group._min.priceBdt),
      cover: covers[index] ? toCardDTO(serializeListing(covers[index])).cover : null,
    })),
    stats: {
      homes: cheapest._count,
      neighbourhoods: areas.length,
      fromBdt: cheapest._min.priceBdt === null ? null : toTaka(cheapest._min.priceBdt),
    },
  };
}
