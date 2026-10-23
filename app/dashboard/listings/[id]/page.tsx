import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { getListingForEdit, listActiveAgents, listFormOptions } from "@/lib/server/agent-listings";
import { requireAgent } from "@/lib/server/auth";
import { ListingEditor } from "./listing-editor";

export const metadata: Metadata = { title: "Edit listing" };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// `/dashboard/listings/[id]` (spec 0005, *Pages*): the edit form, read only for
// agents who are neither the creator nor the assigned agent (AC-12).
export default function EditListingPage({ params }: PageProps<"/dashboard/listings/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: Pick<PageProps<"/dashboard/listings/[id]">, "params">) {
  const { id } = await params;
  const agent = await requireAgent({ next: `/dashboard/listings/${encodeURIComponent(id)}` });
  if (!uuidPattern.test(id)) notFound();

  const [listing, options, agents] = await Promise.all([getListingForEdit(id, agent), listFormOptions(), listActiveAgents()]);
  if (!listing) notFound();

  return <ListingEditor listing={listing} areas={options.areas} amenities={options.amenities} agents={agents} />;
}
