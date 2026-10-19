import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { getListingForEdit, listActiveAgents, listingFormOptions } from "@/lib/server/agent-listings";
import { requireAgent } from "@/lib/server/auth";
import { ListingEditor } from "./listing-editor";

export const metadata: Metadata = { title: "Edit listing" };

export default function EditListingPage({ params }: PageProps<"/dashboard/listings/[id]">) {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: { params: PageProps<"/dashboard/listings/[id]">["params"] }) {
  const { id } = await params;
  const agent = await requireAgent({ next: `/dashboard/listings/${id}` });
  const listing = await getListingForEdit(id, agent);
  if (!listing) notFound();
  const [{ areas, amenities }, agents] = await Promise.all([listingFormOptions(), listActiveAgents()]);

  // Keyed by listing, so moving between listings starts a fresh form.
  return <ListingEditor key={listing.id} listing={listing} areas={areas} amenities={amenities} agents={agents} />;
}

function EditorSkeleton() {
  return (
    <div className="flex flex-col gap-6 lg:flex-row" aria-hidden="true">
      <Skeleton className="h-[640px] flex-1 rounded-2xl" />
      <Skeleton className="h-80 w-full rounded-2xl lg:w-80" />
    </div>
  );
}
