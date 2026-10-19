import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PropertyView } from "@/components/property/property-view";
import { previewView } from "@/components/property/to-view";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAgent } from "@/lib/server/auth";
import { getListingPreview } from "@/lib/server/public-listings";
import { siteUrl } from "@/lib/server/sign-in";

export const metadata: Metadata = { title: "Preview", robots: { index: false, follow: false } };

// An agent's preview of any listing, in any status (spec 0009, AC-10). Never
// cached: the read runs on every request behind the agent gate.
export default function PreviewPage({ params }: PageProps<"/dashboard/listings/[id]/preview">) {
  return (
    <Suspense fallback={<Skeleton className="h-[640px] w-full rounded-2xl" />}>
      <Preview params={params} />
    </Suspense>
  );
}

async function Preview({ params }: { params: PageProps<"/dashboard/listings/[id]/preview">["params"] }) {
  const { id } = await params;
  await requireAgent({ next: `/dashboard/listings/${id}/preview` });
  const listing = await getListingPreview(id);
  if (!listing) notFound();
  return <PropertyView view={previewView(listing)} canonicalUrl={`${siteUrl()}/properties/${listing.slug}`} />;
}
