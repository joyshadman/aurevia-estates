import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { siteUrl } from "@/lib/server/sign-in";
import { sitemapData } from "@/lib/server/sitemap";

// The sitemap (spec 0015, assumed). Read at request time from cached data, so
// the build never needs the database.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const site = siteUrl();
  const { listings, areas } = await sitemapData();
  return [
    { url: `${site}/`, changeFrequency: "daily", priority: 1 },
    { url: `${site}/properties`, changeFrequency: "daily", priority: 0.9 },
    { url: `${site}/about`, changeFrequency: "monthly", priority: 0.5 },
    ...areas.map((area) => ({ url: `${site}/properties?area=${area.slug}`, lastModified: area.updatedAt, changeFrequency: "daily" as const, priority: 0.8 })),
    ...listings.map((listing) => ({
      url: `${site}/properties/${listing.slug}`,
      lastModified: listing.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
      ...(listing.cover ? { images: [listing.cover] } : {}),
    })),
  ];
}
