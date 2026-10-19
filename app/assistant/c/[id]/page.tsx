import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChatShell } from "@/components/assistant/chat-shell";
import { ChatSkeleton } from "@/components/assistant/chat-skeleton";
import type { ChatUIMessage } from "@/lib/assistant/types";
import { loadConversationPage } from "@/lib/server/conversations";
import { chatPageBase } from "../../chat-page-data";

export const metadata: Metadata = { title: "AI Assistant", robots: { index: false } };

// A saved conversation, from the database in send order, with every card joined
// to current listing data (spec 0006, AC-2, AC-18). Not the user's: 404 (AC-11).
export default function ConversationPage({ params }: PageProps<"/assistant/c/[id]">) {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col lg:px-6">
      <Suspense fallback={<ChatSkeleton />}>
        <Conversation params={params} />
      </Suspense>
    </div>
  );
}

async function Conversation({ params }: { params: PageProps<"/assistant/c/[id]">["params"] }) {
  const { id } = await params;
  const base = await chatPageBase(`/assistant/c/${id}`);
  const page = await loadConversationPage(id, base.user);
  if (!page) notFound();

  return (
    <ChatShell
      key={page.id}
      conversationId={page.id}
      initialMessages={page.messages as ChatUIMessage[]}
      initialCards={page.cards}
      initialViewingCards={page.viewingCards}
      initialBriefItems={page.briefItems}
      conversations={base.conversations}
      remaining={base.remaining}
      listingCount={base.listingCount}
      startListing={page.startListing}
      prefill=""
    />
  );
}
