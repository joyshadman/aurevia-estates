import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PropertyView } from "@/components/property/property-view";
import { SimilarHomes } from "@/components/property/similar-homes";
import { publicView } from "@/components/property/to-view";
import { Container } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { propertyTypeLabels } from "@/lib/domain/listing-card";
import { formatPrice } from "@/lib/format";
import { getPublicListing } from "@/lib/server/public-listings";
import { siteUrl } from "@/lib/server/sign-in";

// A home's public page (spec 0009). The read is cached under the listing's
// tags; a hidden or unknown slug shows the not found page with noindex.

function describe(listing: NonNullable<Awaited<ReturnType<typeof getPublicListing>>>["listing"]) {
  const head = [
    `${propertyTypeLabels[listing.propertyType]} in ${listing.area.nameEn}`,
    listing.bedrooms !== null ? `${listing.bedrooms} bed` : null,
    formatPrice(listing.priceBdt),
  ]
    .filter(Boolean)
    .join(" · ");
  const lead = `${head}. `;
  const room = 160 - lead.length;
  const body = listing.description.replace(/\s+/g, " ").trim();
  if (body.length <= room) return lead + body;
  const cut = body.slice(0, room - 1);
  return `${lead}${cut.slice(0, Math.max(cut.lastIndexOf(" "), 0)).trimEnd()}…`;
}

export async function generateMetadata({ params }: PageProps<"/properties/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const result = await getPublicListing(slug);
  if (!result) notFound();
  const { listing } = result;
  const url = `${siteUrl()}/properties/${listing.slug}`;
  const title = `${listing.title} in ${listing.area.nameEn}`;
  const description = describe(listing);
  return {
    metadataBase: new URL(siteUrl()),
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", siteName: "Aurevia Estates" },
    twitter: { card: "summary_large_image", title, description },
    robots: result.status === "SOLD" ? { index: false, follow: true } : undefined,
  };
}

export default function PropertyPage({ params }: PageProps<"/properties/[slug]">) {
  return (
    <Suspense fallback={<PropertySkeleton />}>
      <Property params={params} />
    </Suspense>
  );
}

async function Property({ params }: { params: PageProps<"/properties/[slug]">["params"] }) {
  const { slug } = await params;
  const result = await getPublicListing(slug);
  if (!result) notFound();
  const { listing, status } = result;
  return (
    <PropertyView
      view={publicView(listing, status === "SOLD")}
      canonicalUrl={`${siteUrl()}/properties/${listing.slug}`}
      similar={
        <Suspense fallback={null}>
          <SimilarHomes id={listing.id} propertyType={listing.propertyType} areaId={listing.area.id} priceBdt={listing.priceBdt} />
        </Suspense>
      }
    />
  );
}

function PropertySkeleton() {
  return (
    <Container className="flex flex-col gap-6 py-8" aria-hidden="true">
      <Skeleton className="h-6 w-64" />
      <Skeleton className="h-12 w-2/3" />
      <Skeleton className="aspect-[16/9] w-full rounded-[28px]" />
    </Container>
  );
}
