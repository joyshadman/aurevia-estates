import type { Metadata } from "next";
import { Suspense } from "react";
import { ChatShell } from "@/components/assistant/chat-shell";
import { ChatSkeleton } from "@/components/assistant/chat-skeleton";
import { startListingBySlug } from "@/lib/server/conversations";
import { chatPageBase } from "./chat-page-data";

export const metadata: Metadata = { title: "AI Assistant", robots: { index: false } };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

// A new chat. `?q=` fills the composer without sending; `?listing=<slug>` ties
// the chat to a published listing (spec 0006, AC-13).
export default function AssistantPage({ searchParams }: PageProps<"/assistant">) {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col lg:px-6">
      <Suspense fallback={<ChatSkeleton />}>
        <NewChat searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function NewChat({ searchParams }: { searchParams: PageProps<"/assistant">["searchParams"] }) {
  const params = await searchParams;
  const q = (first(params.q) ?? "").slice(0, 500);
  const slug = first(params.listing);
  const query = new URLSearchParams({ ...(q ? { q } : {}), ...(slug ? { listing: slug } : {}) }).toString();
  const base = await chatPageBase(`/assistant${query ? `?${query}` : ""}`);
  const startListing = await startListingBySlug(slug);

  return (
    <ChatShell
      conversationId={null}
      initialMessages={[]}
      initialCards={{}}
      initialBriefItems={[]}
      conversations={base.conversations}
      remaining={base.remaining}
      listingCount={base.listingCount}
      startListing={startListing}
      prefill={q}
    />
  );
}
