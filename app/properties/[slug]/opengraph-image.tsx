import { notFound } from "next/navigation";
import { getPublicListing } from "@/lib/server/public-listings";
import { shareCardImage, shareCardSize } from "@/lib/server/share-card";

// The share card (spec 0009, AC-8). Reads the same cached listing as the page.

type Params = { params: Promise<{ slug: string }> | { slug: string } };

export async function generateImageMetadata({ params }: Params) {
  // The build calls this without a slug (no static params); there's nothing to describe yet.
  const { slug } = (await params) ?? {};
  if (typeof slug !== "string") return [];
  const result = await getPublicListing(slug);
  if (!result) return [];
  return [{ id: "card", alt: `${result.listing.title} in ${result.listing.area.nameEn}`, size: shareCardSize, contentType: "image/jpeg" }];
}

export default async function Image({ params }: Params) {
  const { slug } = (await params) ?? {};
  const image = typeof slug === "string" ? await shareCardImage(slug) : null;
  if (!image) notFound();
  return new Response(image as BodyInit, { headers: { "content-type": "image/jpeg" } });
}
