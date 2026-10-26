import type { Metadata } from "next";
import { Suspense } from "react";
import { z } from "zod";
import { Container } from "@/components/ui/layout";
import { countryOptions } from "@/lib/domain/phone-countries";
import { routes } from "@/lib/nav";
import { chatMessagesLeft } from "@/lib/server/ai-usage";
import { requireUser } from "@/lib/server/auth";
import { listConversations, startingListingBySlug } from "@/lib/server/conversations";
import { publishedListingCount } from "@/lib/server/listing-count";
import { ChatSkeleton } from "./chat-skeleton";
import { ChatView } from "./chat-view";

export const metadata: Metadata = { title: "AI Assistant" };

// AC-13: `?q=` up to 500 characters; `?listing=` a listing slug.
const maxStartText = 500;
const startParams = z.object({
  q: z.string().optional().catch(undefined),
  listing: z.string().max(200).optional().catch(undefined),
});

// `/assistant` (spec 0006): a new, empty chat. Signed in users only (spec 0008).
export default function AssistantPage({ searchParams }: PageProps<"/assistant">) {
  return (
    <Container className="py-6 lg:py-8">
      <Suspense fallback={<ChatSkeleton />}>
        <NewChat searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function NewChat({ searchParams }: Pick<PageProps<"/assistant">, "searchParams">) {
  const params = await searchParams;
  const next = new URLSearchParams(Object.entries(params).flatMap(([key, value]) => (typeof value === "string" ? [[key, value]] : [])));
  const user = await requireUser({ next: next.size > 0 ? `${routes.assistant}?${next}` : routes.assistant });
  const start = startParams.parse({ q: params.q, listing: params.listing });

  const [remaining, conversations, listingCount, startListing] = await Promise.all([
    // Agents have no daily limit (spec 0006, AC-9).
    user.role === "VISITOR" ? chatMessagesLeft(user.id) : null,
    listConversations(user),
    publishedListingCount(),
    // An unknown or unpublished slug is ignored.
    start.listing ? startingListingBySlug(start.listing) : null,
  ]);

  return (
    <ChatView
      initialMessages={[]}
      initialCards={{}}
      initialRemaining={remaining}
      countries={countryOptions()}
      initialBrief={null}
      conversations={conversations}
      listingCount={listingCount}
      startListing={startListing}
      initialInput={start.q?.slice(0, maxStartText) ?? ""}
    />
  );
}
