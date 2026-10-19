import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { propertyTypes, type PropertyType } from "@/lib/domain/listing-card";
import { db } from "@/lib/server/db";
import { listingCardInclude, serializeListing, toCardDTO } from "@/lib/server/listings";
import { toTaka } from "@/lib/server/money";
import { photoUrl } from "@/lib/server/photos";
import type { SearchCard } from "@/lib/server/public-search";

// The homepage's live data (spec 0012, assumed): the newest homes, the total,
// and a tile per property type. Cached under `listings`, refreshed by spec 0005.

export type TypeTile = { type: PropertyType; count: number; fromPrice: number; cover: { url: string; alt: string } | null };

export async function homeData(): Promise<{ newest: SearchCard[]; total: number; types: TypeTile[] }> {
  "use cache";
  cacheTag("listings");
  cacheLife("hours");
  const published = { status: "PUBLISHED" as const };
  const [rows, total, groups] = await Promise.all([
    db.listing.findMany({ where: published, include: listingCardInclude, orderBy: [{ publishedAt: "desc" }, { id: "desc" }], take: 3 }),
    db.listing.count({ where: published }),
    db.listing.groupBy({ by: ["propertyType"], where: published, _count: { _all: true }, _min: { priceBdt: true } }),
  ]);
  const newest = rows.map((row) => {
    const card = toCardDTO(serializeListing(row));
    return { ...card, pricePerSqft: card.builtUpSqft ? Math.round(card.priceBdt / card.builtUpSqft) : null };
  });

  // The newest listing's cover per type, in the enum's order.
  const present = propertyTypes.filter((t) => groups.some((g) => g.propertyType === t));
  const covers = await Promise.all(
    present.map((type) =>
      db.listing.findFirst({
        where: { ...published, propertyType: type },
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        select: { title: true, photos: { where: { isCover: true }, take: 1 } },
      }),
    ),
  );
  const types = present.map((type, i) => {
    const group = groups.find((g) => g.propertyType === type)!;
    const photo = covers[i]?.photos[0];
    return {
      type,
      count: group._count._all,
      fromPrice: toTaka(group._min.priceBdt ?? BigInt(0)),
      cover: photo ? { url: photoUrl(photo), alt: photo.alt || covers[i]!.title } : null,
    };
  });
  return { newest, total, types };
}
