import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";
import { sitemapListings } from "@/lib/server/listing-page";
import { listingHref } from "./properties/listing-href";

// `/sitemap.xml` (spec 0016, AC-1): the public pages and every published home.
// Its read is cached under `listings`, so an unpublish drops out (AC-4).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const listings = await sitemapListings();
  const newest = listings.reduce<Date | undefined>((latest, row) => (!latest || row.updatedAt > latest ? row.updatedAt : latest), undefined);
  return [
    { url: absoluteUrl("/"), lastModified: newest, changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/properties"), lastModified: newest, changeFrequency: "daily", priority: 0.9 },
    { url: absoluteUrl("/about"), changeFrequency: "monthly", priority: 0.5 },
    // Spec 0017.
    { url: absoluteUrl("/privacy"), changeFrequency: "yearly", priority: 0.2 },
    { url: absoluteUrl("/terms"), changeFrequency: "yearly", priority: 0.2 },
    ...listings.map((row) => ({
      url: absoluteUrl(listingHref(row.slug)),
      lastModified: row.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
