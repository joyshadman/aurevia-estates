"use client";

import { useChat } from "@ai-sdk/react";
import { APICallError, DefaultChatTransport } from "ai";
import { ListFilter, MessagesSquare, RotateCcw, Send, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition, type RefObject } from "react";
import { BookingCard } from "@/components/assistant/booking-card";
import { BriefPane } from "@/components/assistant/brief-pane";
import { ConversationList } from "@/components/assistant/conversation-list";
import { MatchCards } from "@/components/assistant/match-cards";
import { ReplyText } from "@/components/assistant/reply-text";
import { SidePane } from "@/components/assistant/side-pane";
import { ViewingCardView } from "@/components/assistant/viewing-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { chips, greeting, startingGreeting, type ChipStage } from "@/lib/assistant/copy";
import type { ChatMetadata, ChatRefusal, ChatUIMessage, ResultsData } from "@/lib/assistant/types";
import type { ChatLocale } from "@/lib/domain/chat-text";
import type { BriefItem, ChatCard, ConversationRow } from "@/lib/server/conversations";
import type { ViewingCard } from "@/lib/server/viewing-bookings";
import { chatCardsAction, chatSidePanesAction, loadMoreMatchesAction, removeBriefItemAction } from "@/app/assistant/actions";
import { viewingCardsAction } from "@/app/assistant/booking-actions";

// The Aurevia Assistant page (spec 0006): conversations, chat, and brief panes
// from `lg` up; below it, the chat fills the screen and the panes open as a
// drawer and a bottom sheet (AC-17).

const localeKey = "aurevia-chat-locale";
const maxLength = 2000;

export type ChatShellProps = {
  conversationId: string | null;
  initialMessages: ChatUIMessage[];
  initialCards: Record<string, ChatCard>;
  // Confirmation cards by their viewing id, from current data (spec 0007, AC-8).
  initialViewingCards: Record<string, ViewingCard>;
  initialBriefItems: BriefItem[];
  conversations: { rows: ConversationRow[]; nextCursor: string | null };
  remaining: number | null;
  listingCount: number;
  startListing: { slug?: string; title: string; areaName: string } | null;
  prefill: string;
};

const refusalText: Record<string, string> = {
  daily_limit: "You've used today's 40 messages. They reset at midnight Bangladesh time.",
  turn_in_progress: "A reply is still being written. Wait a moment and try again.",
  assistant_unavailable: "The assistant is unavailable right now. Please try again later.",
  not_found: "That conversation no longer exists.",
  signed_out: "Your session ended. Sign in again to keep chatting.",
  invalid: "Messages can be 1 to 2,000 characters.",
  duplicate_message: "That message was already sent.",
  not_retryable: "Only an interrupted reply can be retried.",
};

function refusalOf(error: unknown): ChatRefusal | null {
  if (!APICallError.isInstance(error) || !error.responseBody) return null;
  try {
    return JSON.parse(error.responseBody) as ChatRefusal;
  } catch {
    return { reason: "unknown" };
  }
}

function resultsIn(message: ChatUIMessage): ResultsData | null {
  for (const part of [...message.parts].reverse()) {
    if (part.type === "tool-searchListings" && "state" in part && part.state === "output-available") return part.output as ResultsData;
    if (part.type === "data-matches") return (part as { data: ResultsData }).data;
  }
  return null;
}

type ViewingRef = { leadId: string; viewingId: string };

function viewingRefOf(message: ChatUIMessage): ViewingRef | null {
  const part = message.parts.find((p) => p.type === "data-viewing") as { data?: ViewingRef } | undefined;
  return part?.data ?? null;
}

function textOf(message: ChatUIMessage): string {
  return message.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n");
}

// The reply language toggle, remembered on this device (AC-8). A small store
// over localStorage, so every tab and the server render agree.
const localeEvent = "aurevia-chat-locale";
let memoryLocale: ChatLocale = "en";

function readLocale(): ChatLocale {
  try {
    return window.localStorage.getItem(localeKey) === "bn" ? "bn" : "en";
  } catch {
    // Private mode: the choice lasts for this page only.
    return memoryLocale;
  }
}

function writeLocale(value: ChatLocale) {
  memoryLocale = value;
  try {
    window.localStorage.setItem(localeKey, value);
  } catch {
    // Private mode keeps it in memory.
  }
  window.dispatchEvent(new Event(localeEvent));
}

function subscribeLocale(onChange: () => void) {
  window.addEventListener(localeEvent, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(localeEvent, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// Only the new message goes up; history comes from the database (spec 0006).
// Refs are read when a request is made, never during render.
function createTransport(
  conversationId: RefObject<string | null>,
  locale: RefObject<ChatLocale>,
  startListingSlug: string | undefined,
) {
  return new DefaultChatTransport<ChatUIMessage>({
    api: "/api/chat",
    prepareSendMessagesRequest: ({ messages, trigger, messageId }) => {
      const lastUser = messages.findLast((m) => m.role === "user");
      return {
        body: {
          conversationId: conversationId.current ?? undefined,
          message: lastUser && { id: lastUser.id, role: "user", parts: lastUser.parts.filter((p) => p.type === "text") },
          locale: locale.current,
          trigger,
          ...(trigger === "regenerate-message" ? { regenerateMessageId: messageId } : {}),
          ...(!conversationId.current && startListingSlug ? { startListingSlug } : {}),
        },
      };
    },
  });
}

export function ChatShell(props: ChatShellProps) {
  const locale = useSyncExternalStore(subscribeLocale, readLocale, () => "en" as ChatLocale);
  const [cards, setCards] = useState(props.initialCards);
  const [viewingCards, setViewingCards] = useState(props.initialViewingCards);
  const [brief, setBrief] = useState(props.initialBriefItems);
  const [conversations, setConversations] = useState(props.conversations);
  const [remaining, setRemaining] = useState(props.remaining);
  const [input, setInput] = useState(props.prefill.slice(0, maxLength));
  const [flags, setFlags] = useState<Record<string, "interrupted" | "stopped">>({});
  const [announcement, setAnnouncement] = useState("");
  const [drawer, setDrawer] = useState<"conversations" | "brief" | null>(null);
  const [busy, startBusy] = useTransition();
  const conversationId = useRef(props.conversationId);
  const localeRef = useRef<ChatLocale>("en");
  const composer = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);
  // The transport reads these refs when a request is sent, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [transport] = useState(() => createTransport(conversationId, localeRef, props.startListing?.slug));

  const refreshSides = useCallback((id: string) => {
    void chatSidePanesAction(id).then((sides) => {
      if (!sides) return;
      setBrief(sides.briefItems);
      setConversations(sides.conversations);
      if (sides.remaining !== null) setRemaining(sides.remaining);
    });
  }, []);

  const fetchMissingCards = useCallback((message: ChatUIMessage) => {
    const ids = resultsIn(message)?.cards.map((c) => c.listingId) ?? [];
    if (ids.length === 0) return;
    void chatCardsAction(ids).then((found) => setCards((current) => ({ ...current, ...found })));
  }, []);

  const { messages, setMessages, sendMessage, regenerate, stop, status, error, clearError } = useChat<ChatUIMessage>({
    id: props.conversationId ?? undefined,
    messages: props.initialMessages,
    transport,
    onFinish: ({ message, isAbort, isError, finishReason }) => {
      if (isAbort) setFlags((f) => ({ ...f, [message.id]: "stopped" }));
      else if (isError || finishReason === "length") setFlags((f) => ({ ...f, [message.id]: "interrupted" }));
      if (typeof message.metadata?.remaining === "number") setRemaining(message.metadata.remaining);
      fetchMissingCards(message);
      const text = textOf(message).slice(0, 400);
      if (text) setAnnouncement(`Assistant replied: ${text}`);
      if (conversationId.current) refreshSides(conversationId.current);
    },
    onError: (err) => {
      const refusal = refusalOf(err);
      if (refusal) {
        // Refused before anything was saved: take the message back to the composer.
        setMessages((current) => {
          const last = current.at(-1);
          if (last?.role === "user") setInput(textOf(last));
          return last?.role === "user" ? current.slice(0, -1) : current;
        });
        if (refusal.reason === "daily_limit") setRemaining(0);
      }
    },
  });

  const streaming = status === "submitted" || status === "streaming";
  // The conversation this page shows: from the URL, or the one the first send created.
  const activeId =
    props.conversationId ??
    messages.map((m) => (m.metadata as ChatMetadata | undefined)?.conversationId).findLast(Boolean) ??
    null;

  // The first send creates the conversation; the URL follows without a
  // navigation, so the stream keeps going (AC-2).
  useEffect(() => {
    for (const message of messages) {
      const id = (message.metadata as ChatMetadata | undefined)?.conversationId;
      if (id && id !== conversationId.current) {
        conversationId.current = id;
        window.history.replaceState(null, "", `/assistant/c/${id}`);
      }
    }
  }, [messages]);

  function send(text: string) {
    const value = text.trim();
    if (!value || streaming || remaining === 0) return;
    clearError();
    setInput("");
    void sendMessage({ text: value.slice(0, maxLength) });
  }

  function stopReply() {
    stop();
    const id = conversationId.current;
    if (id) {
      void fetch("/api/chat/stop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId: id }),
      });
    }
  }

  function retry(messageId: string) {
    clearError();
    setFlags((f) => {
      const next = { ...f };
      delete next[messageId];
      return next;
    });
    void regenerate({ messageId });
  }

  function showMore() {
    const id = conversationId.current;
    if (!id) return;
    startBusy(async () => {
      const result = await loadMoreMatchesAction({ conversationId: id });
      if (!result.ok) {
        toast({ tone: "danger", title: refusalText[result.reason] ?? "Something went wrong." });
        return;
      }
      if (result.done) {
        toast({ title: "That's every match for this brief." });
        return;
      }
      setCards((current) => ({ ...current, ...result.cards }));
      setMessages((current) => [...current, result.message as ChatUIMessage]);
    });
  }

  function removeItem(item: BriefItem) {
    const id = conversationId.current;
    if (!id) return;
    startBusy(async () => {
      const result = await removeBriefItemAction({ conversationId: id, field: item.field, value: item.value });
      if (!result.ok) {
        toast({ tone: "danger", title: refusalText[result.reason] ?? "Something went wrong." });
        return;
      }
      setBrief(result.briefItems);
      setMessages((current) => [...current, result.message as ChatUIMessage]);
    });
  }

  // After a change or cancel, every confirmation card follows its lead again.
  function refreshViewings() {
    const refs = messages.map(viewingRefOf).filter((r): r is ViewingRef => r !== null);
    if (refs.length > 0) void viewingCardsAction(refs).then(setViewingCards);
  }

  const ask = (refCode: string) => {
    setInput(`Tell me more about ${refCode}`);
    composer.current?.focus();
  };

  // Which chips to offer: by what the latest reply did (AC-16).
  const last = messages.at(-1);
  const stage: ChipStage | null =
    messages.length === 0
      ? "empty"
      : last?.role !== "assistant"
        ? null
        : resultsIn(last)
          ? "results"
          : last.parts.some((p) => p.type === "tool-getListingDetails")
            ? "details"
            : null;

  // Show more sits under the latest results only.
  const latestResultsId = [...messages].reverse().find((m) => m.role === "assistant" && resultsIn(m))?.id;
  const refusal = error ? refusalOf(error) : null;
  const errorText = refusal
    ? refusal.reason === "daily_limit" && refusal.resetsAt
      ? refusalText.daily_limit
      : (refusalText[refusal.reason] ?? "Something went wrong. Try again.")
    : error
      ? "The reply was interrupted."
      : null;

  const conversationPane = <SidePane conversations={<ConversationList initial={conversations} activeId={activeId} />} />;
  const briefPane = <BriefPane items={brief} locale={locale} disabled={streaming || busy || !activeId} onRemove={removeItem} />;

  return (
    <div className="flex min-h-0 flex-1 gap-6 lg:h-[calc(100dvh-5rem)] lg:py-6">
      <aside aria-label="Conversations and saved homes" className="hidden w-64 shrink-0 overflow-y-auto lg:block">
        {conversationPane}
      </aside>

      <section aria-label="Chat" className="flex min-h-[calc(100dvh-5rem)] min-w-0 flex-1 flex-col rounded-none border-line bg-surface-raised lg:min-h-0 lg:rounded-2xl lg:border">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <Button intent="ghost" size="sm" icon className="lg:hidden" aria-label="Your conversations" onClick={() => setDrawer("conversations")}>
              <MessagesSquare aria-hidden="true" className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="font-display text-lg text-fg">Aurevia Assistant</h1>
              <p className="text-xs text-fg-subtle">Searching {props.listingCount.toLocaleString("en-US")} verified listings</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle value={locale} onChange={writeLocale} />
            <Button intent="ghost" size="sm" className="lg:hidden" onClick={() => setDrawer("brief")}>
              <ListFilter aria-hidden="true" className="h-4 w-4" />
              Your brief
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6" aria-busy={streaming}>
          <ol className="flex flex-col gap-6">
            <li className="max-w-2xl rounded-2xl bg-surface-sunken px-4 py-3 text-sm text-fg" lang={locale}>
              {props.startListing ? startingGreeting(locale, props.startListing.title, props.startListing.areaName) : greeting[locale]}
            </li>
            {messages.map((message) => {
              const metadata = message.metadata as ChatMetadata | undefined;
              const flag = flags[message.id] ?? (metadata?.interrupted ? "interrupted" : metadata?.stopped ? "stopped" : null);
              const isLatest = message.id === last?.id;

              if (message.role === "system") {
                return (
                  <li key={message.id} className="text-center text-xs text-fg-subtle" lang={metadata?.locale}>
                    {textOf(message)}
                  </li>
                );
              }
              if (message.role === "user") {
                return (
                  <li key={message.id} className="ml-auto max-w-xl rounded-2xl bg-accent px-4 py-3 text-sm whitespace-pre-wrap text-on-accent">
                    <span className="sr-only">You said: </span>
                    {textOf(message)}
                  </li>
                );
              }
              const results = resultsIn(message);
              return (
                <li key={message.id} className="flex flex-col gap-3" lang={metadata?.locale}>
                  {message.parts.map((part, i) => {
                    if (part.type === "text" && part.text.trim()) {
                      return <ReplyText key={i} text={part.text} className="max-w-2xl text-sm leading-relaxed text-fg" />;
                    }
                    if (part.type === "tool-updateBrief" && "state" in part && part.state === "output-available") {
                      return (
                        <p key={i} className="text-xs text-fg-subtle">
                          Brief updated
                        </p>
                      );
                    }
                    if (part.type === "tool-offerViewing" && "state" in part && part.state === "output-available") {
                      const offer = part.output as { listingId?: string; refCode?: string; suggestedNote?: string | null; error?: string };
                      if (offer.error || !offer.listingId) return null;
                      const index = messages.indexOf(message);
                      const sent = messages.slice(index + 1).some((later) => {
                        const ref = viewingRefOf(later);
                        return ref !== null && viewingCards[ref.viewingId]?.listing.refCode === offer.refCode;
                      });
                      return (
                        <BookingCard
                          key={i}
                          conversationId={activeId}
                          listingId={offer.listingId}
                          suggestedNote={offer.suggestedNote ?? null}
                          sent={sent}
                          replying={streaming}
                          onBooked={(saved, fresh) => {
                            setViewingCards((current) => ({ ...current, ...fresh }));
                            setMessages((current) => [...current, saved as ChatUIMessage]);
                          }}
                        />
                      );
                    }
                    if (part.type === "data-viewing") {
                      const ref = (part as { data: ViewingRef }).data;
                      const card = viewingCards[ref.viewingId];
                      return card ? <ViewingCardView key={i} card={card} onChanged={refreshViewings} /> : null;
                    }
                    if ((part.type === "tool-searchListings" && "state" in part && part.state === "output-available") || part.type === "data-matches") {
                      const data = (part.type === "data-matches" ? (part as { data: ResultsData }).data : (part as { output: ResultsData }).output);
                      return (
                        <div key={i} className="flex flex-col gap-2">
                          {data.updatedBrief ? <p className="text-xs font-medium text-fg-muted">Results for your updated brief</p> : null}
                          {data.cards.length > 0 ? (
                            <MatchCards cards={data.cards} data={cards} onAsk={ask} disabled={streaming} />
                          ) : null}
                        </div>
                      );
                    }
                    return null;
                  })}
                  {flag === "interrupted" ? (
                    <div className="flex items-center gap-3">
                      <Badge tone="warning">Interrupted</Badge>
                      {isLatest && !streaming ? (
                        <Button size="sm" intent="secondary" onClick={() => retry(message.id)}>
                          <RotateCcw aria-hidden="true" className="h-4 w-4" />
                          Retry
                        </Button>
                      ) : null}
                    </div>
                  ) : flag === "stopped" ? (
                    <Badge className="self-start">Stopped</Badge>
                  ) : null}
                  {results?.hasMore && message.id === latestResultsId && !streaming ? (
                    <Button size="sm" intent="ghost" className="self-start" onClick={showMore} loading={busy}>
                      Show more
                    </Button>
                  ) : null}
                </li>
              );
            })}
            {status === "submitted" ? (
              <li className="text-sm text-fg-subtle" aria-hidden="true">
                Thinking…
              </li>
            ) : null}
          </ol>
        </div>

        <div className="border-t border-line px-4 py-4 sm:px-6">
          {stage && !streaming && remaining !== 0 ? (
            <div className="mb-3 flex flex-wrap gap-2" lang={locale}>
              {chips[stage][locale].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => send(chip)}
                  className="rounded-full border border-line-strong bg-surface-raised px-3 py-1.5 text-xs text-fg hover:bg-surface-sunken"
                >
                  {chip}
                </button>
              ))}
            </div>
          ) : null}
          {errorText ? (
            <p role="alert" className="mb-2 text-sm text-danger">
              {errorText}
            </p>
          ) : null}
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <label htmlFor="chat-composer" className="sr-only">
              Message the assistant
            </label>
            <Textarea
              id="chat-composer"
              ref={composer}
              rows={2}
              value={input}
              maxLength={maxLength}
              disabled={remaining === 0}
              placeholder={locale === "bn" ? "আপনার পছন্দের বাড়ির কথা লিখুন" : "Describe the home you're looking for"}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(input);
                }
              }}
              className="max-h-40 resize-none"
            />
            {streaming ? (
              <Button type="button" intent="secondary" icon aria-label="Stop the reply" onClick={stopReply}>
                <Square aria-hidden="true" className="h-4 w-4" />
              </Button>
            ) : (
              <Button type="submit" icon aria-label="Send" disabled={!input.trim() || remaining === 0}>
                <Send aria-hidden="true" className="h-4 w-4" />
              </Button>
            )}
          </form>
          {remaining !== null && remaining <= 10 ? (
            <p className={cn("mt-2 text-xs", remaining === 0 ? "text-danger" : "text-fg-subtle")}>
              {remaining === 0
                ? "You've used today's 40 messages. They reset at midnight Bangladesh time."
                : `${remaining} message${remaining === 1 ? "" : "s"} left today`}
            </p>
          ) : null}
        </div>
        <div aria-live="polite" className="sr-only">
          {announcement}
        </div>
      </section>

      <aside aria-label="Your brief" className="hidden w-72 shrink-0 overflow-y-auto lg:block">
        <h2 className="mb-3 font-display text-lg text-fg">Your brief</h2>
        {briefPane}
      </aside>

      <Dialog open={drawer === "conversations"} onClose={() => setDrawer(null)} title="Your conversations" placement="right">
        {conversationPane}
      </Dialog>
      <Dialog open={drawer === "brief"} onClose={() => setDrawer(null)} title="Your brief" placement="bottom">
        {briefPane}
      </Dialog>
    </div>
  );
}
