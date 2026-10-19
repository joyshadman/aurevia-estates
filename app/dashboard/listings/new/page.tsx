import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { listingFormOptions } from "@/lib/server/agent-listings";
import { requireAgent } from "@/lib/server/auth";
import { NewListingForm } from "./new-listing-form";

export const metadata: Metadata = { title: "New listing" };

export default function NewListingPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full max-w-xl rounded-2xl" />}>
      <NewListing />
    </Suspense>
  );
}

async function NewListing() {
  await requireAgent({ next: "/dashboard/listings/new" });
  const { areas } = await listingFormOptions();
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl text-fg">New listing</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Start with the basics. It stays a draft, hidden from buyers, until you publish it.
        </p>
      </div>
      <NewListingForm areas={areas} />
    </div>
  );
}
