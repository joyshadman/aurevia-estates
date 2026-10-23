import type { Metadata } from "next";
import { Suspense } from "react";
import { Eyebrow } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { listFormOptions } from "@/lib/server/agent-listings";
import { requireAgent } from "@/lib/server/auth";
import { NewListingForm } from "./new-listing-form";

export const metadata: Metadata = { title: "New listing" };

// `/dashboard/listings/new` (spec 0005, AC-2): a draft needs only a title, a
// type, and an area; the rest is filled in on the edit page.
export default function NewListingPage() {
  return (
    <div className="flex max-w-xl flex-col gap-8">
      <div>
        <Eyebrow>Properties</Eyebrow>
        <h1 className="mt-2 font-display text-3xl text-fg sm:text-4xl">New listing</h1>
        <p className="mt-2 text-sm text-fg-muted">Start with the basics. You can save it as a draft and finish it later.</p>
      </div>
      <Suspense fallback={<Skeleton className="h-72 w-full" />}>
        <NewListing />
      </Suspense>
    </div>
  );
}

async function NewListing() {
  await requireAgent({ next: "/dashboard/listings/new" });
  const { areas } = await listFormOptions();
  return <NewListingForm areas={areas} />;
}
