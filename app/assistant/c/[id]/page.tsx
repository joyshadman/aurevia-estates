import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { Container } from "@/components/ui/layout";
import { chatMessagesLeft } from "@/lib/server/ai-usage";
import { briefView, loadAssistantReference, loadBrief } from "@/lib/server/assistant/brief";
import { chatCards } from "@/lib/server/assistant/cards";
import type { AssistantUIMessage } from "@/lib/server/assistant/history";
import { requireUser } from "@/lib/server/auth";
import { loadMessages, shownListingIds } from "@/lib/server/chat-store";
import { conversationStartingListing, listConversations } from "@/lib/server/conversations";
import { ForbiddenError } from "@/lib/server/errors";
import { publishedListingCount } from "@/lib/server/listing-count";
import { bookingCardData, offeredListingIds, viewingCards, viewingLeadIds } from "@/lib/server/viewing-cards";
import { countryOptions } from "@/lib/domain/phone-countries";
import type { BookingCardLoad } from "../../booking-cards";
import { ChatSkeleton } from "../../chat-skeleton";
import { ChatView } from "../../chat-view";

export const metadata: Metadata = { title: "AI Assistant" };

// `/assistant/c/<id>` (spec 0006): an existing conversation from the database,
// in `seq` order, with every card joined to current listing data (AC-18).
// Another user's conversation is a 404 (AC-11).
export default function ConversationPage({ params }: PageProps<"/assistant/c/[id]">) {
  return (
    <Container className="py-6 lg:py-8">
      <Suspense fallback={<ChatSkeleton />}>
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
  const offered = offeredListingIds(messages);
  const [cards, remaining, booking, viewings, brief, reference, conversations, listingCount, startListing] = await Promise.all([
    chatCards(messages.flatMap((message) => shownListingIds(message.parts))),
    // Agents have no daily limit (AC-9).
    user.role === "VISITOR" ? chatMessagesLeft(user.id) : null,
    // Spec 0007: every booking and confirmation card's data in one batch.
    bookingCardData(user, id, offered),
    viewingCards(user, viewingLeadIds(messages)),
    loadBrief(id),
    loadAssistantReference(),
    listConversations(user),
    publishedListingCount(),
    conversationStartingListing(user, id),
  ]);
  const bookingCards: Record<string, BookingCardLoad> = {};
  for (const listingId of offered) {
    const data = booking.ok ? booking.cards[listingId] : undefined;
    bookingCards[listingId] = data
      ? { ok: true, data }
      : { ok: false, reason: booking.ok ? "listing_unavailable" : booking.reason };
  }

  return (
    <ChatView
      key={id}
      conversationId={id}
      initialMessages={messages as AssistantUIMessage[]}
      initialCards={cards}
      initialRemaining={remaining}
      initialBookingCards={bookingCards}
      initialViewingCards={viewings}
      countries={countryOptions()}
      initialBrief={brief ? briefView(brief, reference) : null}
      conversations={conversations}
      listingCount={listingCount}
      startListing={startListing}
    />
  );
}
