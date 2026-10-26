"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowUp, Check, ChevronDown, CircleAlert, ClipboardList, Menu as MenuIcon, RotateCw, Sparkles, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { PropertyCard } from "@/components/listing/property-card";
import { SaveHomeButton } from "@/app/saved/save-home";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { track } from "@/lib/analytics";
import { stageChips, type ChipStage } from "@/lib/assistant/chips";
import { greeting } from "@/lib/assistant/copy";
import { replyLocale, type ChatLocale } from "@/lib/domain/bangla";
import type { MatchCard } from "@/lib/domain/match-score";
import type { CountryOption } from "@/lib/domain/phone-countries";
import { pluralize } from "@/lib/format";
import { routes } from "@/lib/nav";
import type { BriefView } from "@/lib/server/assistant/brief";
import type { ChatCard } from "@/lib/server/assistant/cards";
import type { AssistantUIMessage } from "@/lib/server/assistant/history";
import type { ConversationPage, StartingListing } from "@/lib/server/conversations";
import type { ViewingCard } from "@/lib/server/viewing-cards";
import { loadChatCards, loadMoreMatches, removeBriefItem } from "./actions";
import { getBookingCardData, getViewingCards } from "./booking-actions";
import { BookingCard, ViewingConfirmation, type BookingCardLoad } from "./booking-cards";
import { BriefPane, briefItemCount, removalKey, type BriefRemoval } from "./brief-pane";
import { ConversationsPane, useConversations, type ConversationList } from "./conversations-pane";
import { MessageText } from "./message-text";
import { chatEditMessages, chatErrorMessages, chatErrorReason } from "./messages";

const maxMessageLength = 2000;
const cardsPerReply = 3;
const titleLength = 60;
const localeKey = "aurevia-chat-locale";
// The composer shows the count from this many messages left (AC-9).
const remainingShownFrom = 10;

type Part = AssistantUIMessage["parts"][number];

// The listing ids a message shows: finished searches and Show more pages.
function shownCards(part: Part): MatchCard[] {
  if (part.type === "tool-searchListings" && part.state === "output-available") return part.output.cards;
  if (part.type === "data-matches") return part.data.cards;
  return [];
}

// A message's last results, for Show more (spec 0006, *Show more*).
function resultsOf(message: AssistantUIMessage): { hasMore: boolean; briefVersion: string | null } | null {
  for (let i = message.parts.length - 1; i >= 0; i--) {
    const part = message.parts[i];
    if (part.type === "tool-searchListings" && part.state === "output-available") return part.output;
    if (part.type === "data-matches") return part.data;
  }
  return null;
}

// The newest stored brief this chat knows: from the page, a removal, or the
// latest `updateBrief` output (AC-3).
function latestBrief(messages: AssistantUIMessage[], known: BriefView | null): BriefView | null {
  let brief = known;
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== "tool-updateBrief" || part.state !== "output-available") continue;
      const candidate = part.output.brief;
      if (!brief || (candidate.updatedAt ?? "") > (brief.updatedAt ?? "")) brief = candidate;
    }
  }
  return brief;
}

// AC-16: the chips for the chat's stage, from the latest assistant reply.
function chipStage(messages: AssistantUIMessage[]): ChipStage | null {
  const last = messages.at(-1);
  if (!last) return "empty";
  if (last.role !== "assistant") return null;
  if (resultsOf(last)) return "results";
  if (last.parts.some((part) => part.type === "tool-getListingDetails" && part.state === "output-available")) return "details";
  return null;
}

const messageText = (message: AssistantUIMessage) =>
  message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");

// Booking cards a message shows (spec 0007): listing ids of finished
// `offerViewing` calls, and the leads of confirmation cards.
function offeredListingId(part: Part): string | null {
  if (part.type !== "tool-offerViewing" || part.state !== "output-available") return null;
  return "listingId" in part.output ? part.output.listingId : null;
}

function viewingLeadId(part: Part): string | null {
  return part.type === "data-viewing" ? part.data.leadId : null;
}

const missingKeys = (messages: AssistantUIMessage[], pick: (part: Part) => string | null, known: object, loading: Set<string>) =>
  [...new Set(messages.flatMap((message) => message.parts.map(pick)).filter((key): key is string => key !== null))].filter(
    (key) => !(key in known) && !loading.has(key),
  );

// What the booking cards need from the chat (spec 0007, *Cards and history*).
type BookingContext = {
  conversationId: string | undefined;
  bookingCards: Record<string, BookingCardLoad>;
  viewingCards: Record<string, ViewingCard>;
  countries: CountryOption[];
  busy: boolean;
  // Homes with a confirmation card after this message (the booking card collapses).
  sentRefCodes: Set<string>;
  onBooked: (message: AssistantUIMessage | null) => void;
  reload: () => Promise<void>;
};

// The toggle's language (spec 0006, *Value sourcing*): `localStorage`, default English.
function storedLocale(): ChatLocale {
  try {
    return window.localStorage.getItem(localeKey) === "bn" ? "bn" : "en";
  } catch {
    return "en";
  }
}

// The toggle as an external store: other tabs follow through `storage` events.
// A page that can't store it (private mode) keeps the choice in memory.
const localeListeners = new Set<() => void>();
let memoryLocale: ChatLocale | null = null;

function subscribeLocale(listener: () => void) {
  localeListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    localeListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

const localeSnapshot = () => memoryLocale ?? storedLocale();

function storeLocale(locale: ChatLocale) {
  try {
    window.localStorage.setItem(localeKey, locale);
    memoryLocale = null;
  } catch {
    memoryLocale = locale;
  }
  for (const listener of localeListeners) listener();
}

type SendBody = { conversationId?: string; startListingSlug?: string };

// Only the new message is sent; the server reads the history (spec 0006).
// `body` carries the conversation id, and on a first message the starting
// listing (AC-13), from each send.
const transport = new DefaultChatTransport<AssistantUIMessage>({
  api: "/api/chat",
  prepareSendMessagesRequest: ({ messages, trigger, messageId, body }) => ({
    body: {
      conversationId: (body as SendBody | undefined)?.conversationId,
      startListingSlug: (body as SendBody | undefined)?.startListingSlug,
      message: messages.at(-1),
      locale: localeSnapshot(),
      trigger,
      regenerateMessageId: trigger === "regenerate-message" ? messageId : undefined,
    },
  }),
});

export type ChatViewProps = {
  conversationId?: string;
  initialMessages: AssistantUIMessage[];
  initialCards: Record<string, ChatCard>;
  // Messages left today; null for agents, who have no limit (AC-9).
  initialRemaining: number | null;
  // Spec 0007: booking card data by listing id and confirmation cards by lead
  // id, loaded with the page so a reopened chat makes no per card calls.
  initialBookingCards?: Record<string, BookingCardLoad>;
  initialViewingCards?: Record<string, ViewingCard>;
  countries: CountryOption[];
  initialBrief: BriefView | null;
  conversations: ConversationPage;
  // "Searching N verified listings".
  listingCount: number;
  // The home the chat started from (AC-13): named in the greeting, and sent
  // with the first message of a new chat.
  startListing: StartingListing | null;
  // `?q=`: put in the composer, not sent (AC-13).
  initialInput?: string;
};

// The chat page (spec 0006, AC-17): conversations, the chat, and the brief in
// three panes from `lg`; below it, a drawer and a bottom sheet. The list lives
// here, above the chat, so it survives starting a new chat in place.
export function ChatView(props: ChatViewProps) {
  const router = useRouter();
  const list = useConversations(props.conversations);
  const [generation, setGeneration] = useState(0);

  // On `/assistant/c/<id>` a navigation gives a fresh chat. On `/assistant`,
  // the page stays mounted (the first reply only replaced the address), so the
  // chat is remounted here, without the starting points it was opened with.
  const startOver = (navigate: "push" | "replace") => {
    if (!props.conversationId) setGeneration((current) => current + 1);
    router[navigate](routes.assistant);
  };

  return (
    <Chat
      key={generation}
      {...props}
      {...(generation > 0 ? { initialInput: "", startListing: null, initialBrief: null } : {})}
      list={list}
      onNewChat={() => startOver("push")}
      onCurrentDeleted={() => startOver("replace")}
    />
  );
}

function Chat({
  conversationId: initialConversationId,
  initialMessages,
  initialCards,
  initialRemaining,
  initialBookingCards = {},
  initialViewingCards = {},
  countries,
  initialBrief,
  listingCount,
  startListing,
  initialInput = "",
  list,
  onNewChat,
  onCurrentDeleted,
}: ChatViewProps & { list: ConversationList; onNewChat: () => void; onCurrentDeleted: () => void }) {
  const [cards, setCards] = useState(initialCards);
  const [bookingCards, setBookingCards] = useState(initialBookingCards);
  const [viewingCards, setViewingCards] = useState(initialViewingCards);
  const loadingBookings = useRef(new Set<string>());
  const loadingViewings = useRef(new Set<string>());
  const [input, setInput] = useState(initialInput);
  const [announcement, setAnnouncement] = useState("");
  const [knownBrief, setKnownBrief] = useState(initialBrief);
  const [removing, setRemoving] = useState<string | null>(null);
  const [showingMore, setShowingMore] = useState(false);
  // Results messages whose Show more found nothing further.
  const [exhausted, setExhausted] = useState<string[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Replies this visitor stopped in this session; on reload the saved
  // `metadata.stopped` says the same.
  const [stoppedIds, setStoppedIds] = useState<string[]>([]);
  const loading = useRef(new Set<string>());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // What to restore if the server refuses a send or a Retry (nothing was saved).
  const lastSent = useRef<string | null>(null);
  const beforeRetry = useRef<AssistantUIMessage[] | null>(null);
  const visitor = initialRemaining !== null;

  // The toggle is remembered on the device (AC-8); English on the server.
  const locale = useSyncExternalStore(subscribeLocale, localeSnapshot, () => "en" as const);

  const { messages, sendMessage, regenerate, stop, setMessages, status, error, clearError } = useChat<AssistantUIMessage>({
    id: initialConversationId ?? "new",
    messages: initialMessages,
    transport,
    // The finished reply is announced once, not word by word (AC-17), without
    // the bold markers a screen reader would read out.
    onFinish: ({ message }) => {
      setAnnouncement(messageText(message).replace(/\*\*/g, ""));
      // Spec 0018, AC-1: once per reply that shows homes.
      const refCodes = message.parts.flatMap(shownCards).map((card) => card.refCode);
      if (refCodes.length > 0) track({ name: "listing_recommended", props: { count: refCodes.length, ref_codes: refCodes } });
    },
    onError: (failure) => {
      // A refusal (limit, turn in progress) saved nothing: put things back.
      if (chatErrorReason(failure) === "failed") return;
      if (beforeRetry.current) {
        setMessages(beforeRetry.current);
      } else {
        setMessages((current) => (current.at(-1)?.role === "user" ? current.slice(0, -1) : current));
        if (lastSent.current !== null) setInput(lastSent.current);
      }
    },
  });
  const busy = status === "submitted" || status === "streaming";

  // The page's conversation, or the one the first reply created.
  const conversationId =
    initialConversationId ?? messages.findLast((message) => message.metadata?.conversationId)?.metadata?.conversationId;

  // Once the first reply names the conversation, the address bar follows and
  // the conversation joins the list, titled like the server titles it.
  useEffect(() => {
    if (!conversationId) return;
    const path = `/assistant/c/${conversationId}`;
    if (window.location.pathname !== path) window.history.replaceState(null, "", path);
    if (!initialConversationId) {
      const first = messages.find((message) => message.role === "user");
      const title = first ? messageText(first).trim().slice(0, titleLength).trim() || null : null;
      list.upsert({ id: conversationId, title, lastMessageAt: new Date().toISOString() });
    }
    // Runs once per conversation id; the list and messages are read as they are then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // From `lg` the panes are on screen; a drawer or sheet left open would trap focus.
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 64rem)");
    const close = () => {
      if (!wide.matches) return;
      setDrawerOpen(false);
      setSheetOpen(false);
    };
    wide.addEventListener("change", close);
    return () => wide.removeEventListener("change", close);
  }, []);

  // Keep the newest message in view as the chat grows (not while text streams).
  useEffect(() => {
    if (messages.length === 0) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    endRef.current?.scrollIntoView({ block: "end", behavior: reduced ? "auto" : "smooth" });
  }, [messages.length]);

  // Current data for cards a reply just showed (AC-18).
  useEffect(() => {
    const missing = [
      ...new Set(messages.flatMap((message) => message.parts.flatMap(shownCards).map((card) => card.listingId))),
    ].filter((id) => !(id in cards) && !loading.current.has(id));
    if (missing.length === 0) return;
    for (const id of missing) loading.current.add(id);
    void loadChatCards({ listingIds: missing }).then((loaded) => {
      for (const id of missing) loading.current.delete(id);
      setCards((current) => ({ ...current, ...loaded }));
    });
  }, [messages, cards]);

  // Booking cards that appear in this session (a live reply, or right after
  // Confirm); a reopened chat already has theirs from the page (spec 0007).
  const loadBookingCards = async (listingIds: string[]) => {
    if (!conversationId || listingIds.length === 0) return;
    for (const id of listingIds) loadingBookings.current.add(id);
    const loaded = await Promise.all(
      listingIds.map(async (listingId) => [listingId, await getBookingCardData({ conversationId, listingId })] as const),
    );
    for (const id of listingIds) loadingBookings.current.delete(id);
    setBookingCards((current) => ({ ...current, ...Object.fromEntries(loaded) }));
  };

  const loadViewingCards = async (leadIds: string[]) => {
    if (!conversationId || leadIds.length === 0) return;
    for (const id of leadIds) loadingViewings.current.add(id);
    const result = await getViewingCards({ conversationId, leadIds });
    for (const id of leadIds) loadingViewings.current.delete(id);
    if (result.ok) setViewingCards((current) => ({ ...current, ...result.cards }));
  };

  useEffect(() => {
    void loadBookingCards(missingKeys(messages, offeredListingId, bookingCards, loadingBookings.current));
    void loadViewingCards(missingKeys(messages, viewingLeadId, viewingCards, loadingViewings.current));
    // The loaders read only refs and the conversation id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, bookingCards, viewingCards, conversationId]);

  // After a change or cancel, every booking card in the chat reads again.
  const reloadBookings = async () => {
    const all = (pick: (part: Part) => string | null) => [
      ...new Set(messages.flatMap((message) => message.parts.map(pick)).filter((key): key is string => key !== null)),
    ];
    await Promise.all([loadBookingCards(all(offeredListingId)), loadViewingCards(all(viewingLeadId))]);
  };

  // A message the server saved outside a reply joins the chat without a reload.
  const appendMessage = (message: AssistantUIMessage) =>
    setMessages((current) => (current.some((m) => m.id === message.id) ? current : [...current, message]));

  // AC-5 (spec 0007): the saved confirmation card joins the chat.
  const onBooked = (message: AssistantUIMessage | null) => {
    if (message) appendMessage(message);
    else void reloadBookings();
  };

  // `fromComposer`: a refused send puts the text back in the composer. A chip
  // leaves the visitor's draft alone.
  const sendText = (raw: string, fromComposer: boolean) => {
    const text = raw.trim();
    if (!text || text.length > maxMessageLength || busy) return;
    clearError();
    lastSent.current = fromComposer ? text : null;
    beforeRetry.current = null;
    if (conversationId) {
      const known = list.rows.find((row) => row.id === conversationId);
      list.upsert({ id: conversationId, title: known?.title ?? null, lastMessageAt: new Date().toISOString() });
    }
    const body: SendBody = conversationId ? { conversationId } : { startListingSlug: startListing?.slug };
    // Spec 0018, AC-1: the first message of a new conversation.
    if (!conversationId) track({ name: "chat_started", props: { from_listing: Boolean(startListing) } });
    void sendMessage({ text }, { body });
  };

  const send = () => {
    if (!input.trim() || input.trim().length > maxMessageLength || busy) return;
    setInput("");
    sendText(input, true);
  };

  // AC-16: a chip is sent as the visitor's message (it counts toward the limit).
  const sendChip = (text: string) => sendText(text, false);

  // Retry regenerates an interrupted reply in place, under the same id (AC-10).
  const retry = (messageId: string) => {
    clearError();
    beforeRetry.current = messages;
    void regenerate({ messageId, body: { conversationId } });
  };

  // Stop ends the model call on the server within about a second; the reply is
  // saved as it stands (AC-10). Stopping the local stream alone would not.
  const stopReply = () => {
    const last = messages.at(-1);
    if (last?.role === "assistant") setStoppedIds((ids) => [...ids, last.id]);
    void stop();
    if (conversationId) {
      void fetch("/api/chat/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
    }
  };

  const brief = latestBrief(messages, knownBrief);

  // AC-12: no model call, no limit slot; the note joins the chat.
  const removeFromBrief = async (removal: BriefRemoval) => {
    if (!conversationId || busy || removing) return;
    setRemoving(removalKey(removal));
    const result = await removeBriefItem({ conversationId, ...removal });
    setRemoving(null);
    if (!result.ok) {
      toast({ tone: "danger", title: chatEditMessages[result.reason] });
      return;
    }
    setKnownBrief(result.brief);
    appendMessage(result.message);
  };

  // AC-4: the next 3 homes from the same ranking, without the model.
  const showMore = async (resultsMessageId: string) => {
    if (!conversationId || busy || showingMore) return;
    setShowingMore(true);
    const result = await loadMoreMatches({ conversationId });
    setShowingMore(false);
    if (!result.ok) {
      toast({ tone: "danger", title: chatEditMessages[result.reason] });
      return;
    }
    if ("done" in result) {
      setExhausted((ids) => [...ids, resultsMessageId]);
      toast({ title: "That's every home that fits this brief." });
      return;
    }
    setCards((current) => ({ ...current, ...result.cards }));
    appendMessage(result.message);
  };

  // Today's messages left: from the latest reply, else from the page (AC-9).
  const remaining =
    messages.findLast((message) => message.metadata?.remaining !== undefined)?.metadata?.remaining ?? initialRemaining;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    send();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  };

  const askAbout = (refCode: string) => {
    setInput(`Tell me more about ${refCode}`);
    inputRef.current?.focus();
  };

  // For each message, the homes with a confirmation card later in the chat.
  const sentAfter: Set<string>[] = [];
  const seen = new Set<string>();
  for (let i = messages.length - 1; i >= 0; i--) {
    sentAfter[i] = new Set(seen);
    for (const part of messages[i].parts) {
      const leadId = viewingLeadId(part);
      const refCode = leadId ? viewingCards[leadId]?.refCode : undefined;
      if (refCode) seen.add(refCode);
    }
  }
  const bookingContext = (index: number): BookingContext => ({
    conversationId,
    bookingCards,
    viewingCards,
    countries,
    busy,
    sentRefCodes: sentAfter[index],
    onBooked,
    reload: reloadBookings,
  });

  const errorReason = chatErrorReason(error);
  // Retry shows only on an interrupted reply: saved as one, flagged by the
  // stream's finish, or cut off by a failed stream (AC-10).
  const last = messages.at(-1);
  const retryableId =
    !busy && last?.role === "assistant" && (last.metadata?.interrupted || errorReason === "failed") ? last.id : null;

  // Show more sits under the latest results while more remain, or when the
  // brief changed since (the server then starts over).
  const resultsIndex = messages.findLastIndex((message) => message.role === "assistant" && resultsOf(message) !== null);
  const latestResults = resultsIndex === -1 ? null : resultsOf(messages[resultsIndex]);
  const showMoreId =
    latestResults &&
    !exhausted.includes(messages[resultsIndex].id) &&
    (latestResults.hasMore || latestResults.briefVersion !== (brief?.updatedAt ?? null))
      ? messages[resultsIndex].id
      : null;

  const stage = busy ? null : chipStage(messages);
  const chips = stage ? stageChips(stage, locale, { visitor }) : [];
  const briefCount = briefItemCount(brief);
  const greetingText = greeting(locale, startListing);

  const briefPane = (inDialog: boolean) => (
    <BriefPane
      brief={brief}
      locale={locale}
      disabled={busy || !conversationId}
      pending={removing}
      onRemove={(removal) => void removeFromBrief(removal)}
      inDialog={inDialog}
    />
  );

  const conversationsPane = (inDrawer: boolean) => (
    <ConversationsPane
      list={list}
      currentId={conversationId}
      busy={busy}
      onNewChat={() => {
        setDrawerOpen(false);
        onNewChat();
      }}
      onNavigate={inDrawer ? () => setDrawerOpen(false) : undefined}
      onDeleted={(id) => {
        if (id !== conversationId) return;
        setDrawerOpen(false);
        onCurrentDeleted();
      }}
    />
  );

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <aside className="hidden lg:col-span-3 lg:block">
        <div className="sticky top-28 max-h-[calc(100dvh-8rem)] overflow-y-auto pb-4">{conversationsPane(false)}</div>
      </aside>

      <section
        aria-labelledby="chat-heading"
        className="flex min-h-[calc(100dvh-8rem)] min-w-0 flex-col overflow-clip rounded-2xl border border-line bg-surface-raised shadow-soft lg:col-span-6"
      >
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              type="button"
              icon
              intent="ghost"
              size="sm"
              className="lg:hidden"
              aria-label="Your conversations"
              onClick={() => setDrawerOpen(true)}
            >
              <MenuIcon aria-hidden="true" strokeWidth={1.5} className="h-5 w-5" />
            </Button>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-on-accent">
              <Sparkles aria-hidden="true" strokeWidth={1.5} className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 id="chat-heading" className="font-display text-xl leading-tight text-fg">
                Aurevia Assistant
              </h1>
              <p className="flex items-center gap-1.5 text-xs text-fg-muted">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
                Searching {pluralize(listingCount, "verified listing")}
              </p>
            </div>
          </div>
          <LanguageToggle value={locale} onChange={storeLocale} />
        </header>

        {/* `isolate` keeps the cards' `z-10` badges and footers inside the
            message list, so they scroll under the sticky composer, not over it. */}
        <div className="isolate flex-1 bg-surface px-4 py-6 sm:px-6">
          <ol className="flex flex-col gap-6">
            <li>
              <AssistantRow>
                <div lang={locale === "bn" ? "bn" : undefined} className={bubbleClass}>
                  <p>{greetingText}</p>
                </div>
              </AssistantRow>
            </li>
            {messages.map((message, index) => (
              <li key={message.id}>
                <Message
                  message={message}
                  cards={cards}
                  booking={bookingContext(index)}
                  onAskAbout={askAbout}
                  stopped={stoppedIds.includes(message.id)}
                  onRetry={message.id === retryableId ? () => retry(message.id) : undefined}
                  showMore={
                    message.id === showMoreId
                      ? { pending: showingMore, disabled: busy, onClick: () => void showMore(message.id) }
                      : undefined
                  }
                />
              </li>
            ))}
          </ol>
          {status === "submitted" ? (
            <p className="mt-6 ml-10 flex items-center gap-2 text-sm text-fg-muted" role="status">
              <span className="h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden="true" />
              The assistant is thinking…
            </p>
          ) : null}
          <div ref={endRef} />
        </div>

        <div aria-live="polite" className="sr-only">
          {announcement}
        </div>

        <form onSubmit={onSubmit} className="sticky bottom-0 border-t border-line bg-surface-raised px-4 pt-3 pb-4 sm:px-6">
          {errorReason ? (
            <p role="alert" className="mb-3 flex items-start gap-2 rounded-xl bg-danger-subtle px-4 py-3 text-sm text-danger-subtle-fg">
              <CircleAlert aria-hidden="true" strokeWidth={1.5} className="mt-0.5 h-4 w-4 shrink-0" />
              {chatErrorMessages[errorReason]}
            </p>
          ) : null}
          <div className="mb-3 flex items-center gap-2">
            {chips.length > 0 ? (
              <ul aria-label="Suggestions" className="-mx-1 flex min-w-0 flex-1 gap-2 overflow-x-auto px-1 pb-1">
                {chips.map((chip) => (
                  <li key={chip} className="shrink-0">
                    <button
                      type="button"
                      lang={locale === "bn" ? "bn" : undefined}
                      onClick={() => sendChip(chip)}
                      className="rounded-full border border-line-strong px-3.5 py-2 text-xs text-fg-muted transition-colors duration-fast hover:border-accent hover:text-accent"
                    >
                      {chip}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="flex-1" />
            )}
            <Button
              type="button"
              intent="secondary"
              size="sm"
              className="lg:hidden"
              aria-haspopup="dialog"
              onClick={() => setSheetOpen(true)}
            >
              <ClipboardList aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
              Your brief{briefCount > 0 ? ` (${briefCount})` : ""}
            </Button>
          </div>
          <div className="flex items-end gap-3 rounded-2xl border border-line-strong bg-surface-raised p-2 focus-within:border-accent">
            <label htmlFor="chat-input" className="sr-only">
              Message the Aurevia Assistant
            </label>
            <Textarea
              ref={inputRef}
              id="chat-input"
              rows={2}
              value={input}
              maxLength={maxMessageLength}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Describe the home you're looking for…"
              className="min-h-0 flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
            {busy ? (
              <Button type="button" icon intent="secondary" aria-label="Stop" onClick={stopReply}>
                <Square aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
              </Button>
            ) : (
              <Button type="submit" icon aria-label="Send" disabled={input.trim() === ""}>
                <ArrowUp aria-hidden="true" strokeWidth={1.5} className="h-5 w-5" />
              </Button>
            )}
          </div>
          <p className="mt-2 text-center text-xs text-fg-subtle">
            {remaining !== null && remaining <= remainingShownFrom
              ? `${remaining === 1 ? "1 message" : `${remaining} messages`} left today. It resets at midnight, Bangladesh time.`
              : "Answers come only from Aurevia's verified listings. An advisor reviews every booking."}
          </p>
        </form>
      </section>

      <aside className="hidden lg:col-span-3 lg:block">
        <div className="sticky top-28 max-h-[calc(100dvh-8rem)] overflow-y-auto rounded-2xl border border-line bg-surface-raised p-6 shadow-soft">
          {briefPane(false)}
        </div>
      </aside>

      <Dialog open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Your conversations" placement="left" className="lg:hidden">
        {conversationsPane(true)}
      </Dialog>
      <Dialog
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Your brief"
        description="Built from this conversation"
        placement="bottom"
        className="lg:hidden"
      >
        {briefPane(true)}
      </Dialog>
    </div>
  );
}

const bubbleClass = "max-w-[85%] rounded-2xl rounded-tl-md border border-line bg-surface-raised px-4 py-3 text-sm leading-relaxed text-fg";

// The assistant's side of the chat: the "A" mark, then its content.
function AssistantRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span
        aria-hidden="true"
        className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-subtle font-display text-sm text-accent-subtle-fg"
      >
        A
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">{children}</div>
    </div>
  );
}

function Message({
  message,
  cards,
  booking,
  onAskAbout,
  stopped,
  onRetry,
  showMore,
}: {
  message: AssistantUIMessage;
  cards: Record<string, ChatCard>;
  booking: BookingContext;
  onAskAbout: (refCode: string) => void;
  stopped: boolean;
  onRetry?: () => void;
  showMore?: { pending: boolean; disabled: boolean; onClick: () => void };
}) {
  if (message.role === "user") {
    const text = messageText(message);
    return (
      <div className="flex justify-end">
        <p
          lang={replyLocale(text, "en") === "bn" ? "bn" : undefined}
          className="max-w-[85%] rounded-2xl rounded-tr-md bg-accent px-4 py-3 text-sm leading-relaxed whitespace-pre-line text-on-accent"
        >
          {text}
        </p>
      </div>
    );
  }

  if (message.role === "system") {
    const text = messageText(message);
    return (
      <p lang={replyLocale(text, "en") === "bn" ? "bn" : undefined} className="text-center text-sm text-fg-subtle">
        {text}
      </p>
    );
  }

  const metadata = message.metadata;
  return (
    <AssistantRow>
      {message.parts.map((part, i) => {
        if (part.type === "text") {
          if (!part.text.trim()) return null;
          return (
            <div key={i} lang={replyLocale(part.text, "en") === "bn" ? "bn" : undefined} className={bubbleClass}>
              <MessageText text={part.text} />
            </div>
          );
        }
        if (part.type === "tool-updateBrief" && part.state === "output-available") {
          return (
            <p key={i} className="flex items-center gap-2 text-xs text-fg-subtle">
              <Check aria-hidden="true" strokeWidth={1.5} className="h-3.5 w-3.5" />
              Brief updated
            </p>
          );
        }
        // Spec 0007: an error output shows nothing; the reply explains it.
        if (part.type === "tool-offerViewing" && part.state === "output-available" && "listingId" in part.output) {
          const { listingId, refCode, suggestedNote } = part.output;
          if (!booking.conversationId) return null;
          return (
            <BookingCard
              key={i}
              conversationId={booking.conversationId}
              refCode={refCode}
              suggestedNote={suggestedNote}
              load={booking.bookingCards[listingId]}
              countries={booking.countries}
              busy={booking.busy}
              sent={booking.sentRefCodes.has(refCode)}
              onBooked={(saved) => booking.onBooked(saved as AssistantUIMessage | null)}
              onReload={booking.reload}
            />
          );
        }
        if (part.type === "data-viewing") {
          return (
            <ViewingConfirmation
              key={i}
              viewingId={part.data.viewingId}
              card={booking.viewingCards[part.data.leadId]}
              onChanged={booking.reload}
            />
          );
        }
        const shown = shownCards(part);
        if (shown.length > 0) {
          const label = part.type === "data-matches" ? part.data.label : undefined;
          return (
            <div key={i} className="flex flex-col gap-3">
              {label ? (
                <p lang={replyLocale(label, "en") === "bn" ? "bn" : undefined} className="text-sm font-medium text-fg">
                  {label}
                </p>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                {shown.slice(0, cardsPerReply).map((card) => (
                  <MatchCardView key={card.listingId} match={card} data={cards[card.listingId]} onAskAbout={onAskAbout} />
                ))}
              </div>
            </div>
          );
        }
        return null;
      })}
      {showMore ? (
        <Button
          type="button"
          intent="secondary"
          size="sm"
          className="self-start"
          loading={showMore.pending}
          disabled={showMore.disabled}
          onClick={showMore.onClick}
        >
          <ChevronDown aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
          Show more
        </Button>
      ) : null}
      {metadata?.interrupted || onRetry ? (
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="warning">Interrupted</Badge>
          {onRetry ? (
            <Button type="button" intent="secondary" size="sm" onClick={onRetry}>
              <RotateCw aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
              Retry
            </Button>
          ) : null}
        </div>
      ) : metadata?.stopped || stopped ? (
        <Badge className="self-start">Stopped</Badge>
      ) : null}
    </AssistantRow>
  );
}

function MatchCardView({
  match,
  data,
  onAskAbout,
}: {
  match: MatchCard;
  data: ChatCard | undefined;
  onAskAbout: (refCode: string) => void;
}) {
  if (!data) return <Skeleton className="h-80 w-full rounded-2xl" />;
  if (!data.available) {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface-raised p-6">
        <p className="text-sm font-medium text-fg">{match.refCode}</p>
        <p className="text-sm text-fg-muted">No longer available</p>
      </div>
    );
  }

  const badge =
    match.matchPercent !== null ? (
      <Badge tone={match.exact ? "accent" : "neutral"}>{match.matchPercent}% match</Badge>
    ) : !match.exact ? (
      <Badge>Close, but</Badge>
    ) : null;

  return (
    <PropertyCard
      listing={data.card}
      badge={badge}
      save={<SaveHomeButton slug={data.card.slug} />}
      footer={
        <div className="flex flex-col gap-3">
          {match.why.length > 0 ? (
            <ul className="flex flex-col gap-1 text-sm text-fg-muted">
              {match.why.slice(0, 3).map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <Check aria-hidden="true" strokeWidth={1.5} className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  {line}
                </li>
              ))}
            </ul>
          ) : null}
          {!match.exact && match.differs.length > 0 ? (
            <p className="text-sm text-fg-muted">
              <span className="font-medium text-fg">Close, but: </span>
              {match.differs.join("; ")}
            </p>
          ) : null}
          <Button type="button" intent="secondary" size="sm" className="self-start" onClick={() => onAskAbout(match.refCode)}>
            Ask about this home
          </Button>
        </div>
      }
    />
  );
}
