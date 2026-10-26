import { Star } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Eyebrow } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/state";
import { requireAgent } from "@/lib/server/auth";
import { featurableListings } from "@/lib/server/featured";
import { FeaturePreview } from "./feature-preview";

export const metadata: Metadata = { title: "Featured listings" };

// `/dashboard/featured` (spec 0023): a preview only. No payment, no prices, no
// writes; it is replaced when paid featuring is designed (AC-1 to AC-3).
export default function FeaturedPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <div className="flex items-center gap-3">
          <Eyebrow>Agent dashboard</Eyebrow>
          <Badge tone="warning">Preview</Badge>
        </div>
        <h1 className="mt-2 font-display text-3xl text-fg sm:text-4xl">Featured listings</h1>
        <p className="mt-2 max-w-2xl text-sm text-fg-muted">
          A featured home will show first in search and on the homepage for the period you choose. This page is a preview:
          payments aren&apos;t open yet, so nothing here is charged or saved.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-80 w-full" />}>
        <FeaturedContent />
      </Suspense>
    </div>
  );
}

async function FeaturedContent() {
  const agent = await requireAgent({ next: "/dashboard/featured" });
  const listings = await featurableListings(agent);
  if (listings.length === 0) {
    return <EmptyState icon={Star} title="No published listings yet" body="Publish a listing first; then you can pick it here." />;
  }
  return <FeaturePreview listings={listings} />;
}
