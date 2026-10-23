import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { Container } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { chatMessagesLeft } from "@/lib/server/ai-usage";
import { chatCards } from "@/lib/server/assistant/cards";
import type { AssistantUIMessage } from "@/lib/server/assistant/history";
import { requireUser } from "@/lib/server/auth";
import { loadMessages, shownListingIds } from "@/lib/server/chat-store";
import { ForbiddenError } from "@/lib/server/errors";
import { ChatView } from "../../chat-view";

export const metadata: Metadata = { title: "AI Assistant" };

// `/assistant/c/<id>` (spec 0006): an existing conversation from the database,
// in `seq` order, with every card joined to current listing data (AC-18).
// Another user's conversation is a 404 (AC-11).
export default function ConversationPage({ params }: PageProps<"/assistant/c/[id]">) {
  return (
    <Container className="max-w-4xl">
      <Suspense fallback={<Skeleton className="mt-8 h-64 w-full" />}>
        <Conversation params={params} />
      </Suspense>
    </Container>
  );
}

async function Conversation({ params }: Pick<PageProps<"/assistant/c/[id]">, "params">) {
  const { id } = await params;
  const user = await requireUser({ next: `/assistant/c/${id}` });
  if (!z.uuid().safeParse(id).success) notFound();

  let messages;
  try {
    messages = await loadMessages(id, user);
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }
  const [cards, remaining] = await Promise.all([
    chatCards(messages.flatMap((message) => shownListingIds(message.parts))),
    // Agents have no daily limit (AC-9).
    user.role === "VISITOR" ? chatMessagesLeft(user.id) : null,
  ]);

  return (
    <ChatView
      key={id}
      conversationId={id}
      initialMessages={messages as AssistantUIMessage[]}
      initialCards={cards}
      initialRemaining={remaining}
    />
  );
}
