"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowUp, Check, CircleAlert, RotateCw, Sparkles, Square } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { PropertyCard } from "@/components/listing/property-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { replyLocale, type ChatLocale } from "@/lib/domain/bangla";
import type { MatchCard } from "@/lib/domain/match-score";
import type { ChatCard } from "@/lib/server/assistant/cards";
import type { AssistantUIMessage } from "@/lib/server/assistant/history";
import { loadChatCards } from "./actions";
import { MessageText } from "./message-text";
import { chatErrorMessages, chatErrorReason } from "./messages";

const maxMessageLength = 2000;
const cardsPerReply = 3;
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

const messageText = (message: AssistantUIMessage) =>
  message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");

// The toggle's language (spec 0006, *Value sourcing*): `localStorage`, default English.
function storedLocale(): ChatLocale {
  try {
    return window.localStorage.getItem(localeKey) === "bn" ? "bn" : "en";
  } catch {
    return "en";
  }
}

// Only the new message is sent; the server reads the history (spec 0006).
// `body` carries the conversation id from each send.
const transport = new DefaultChatTransport<AssistantUIMessage>({
  api: "/api/chat",
  prepareSendMessagesRequest: ({ messages, trigger, messageId, body }) => ({
    body: {
      conversationId: (body as { conversationId?: string } | undefined)?.conversationId,
      message: messages.at(-1),
      locale: storedLocale(),
      trigger,
      regenerateMessageId: trigger === "regenerate-message" ? messageId : undefined,
    },
  }),
});

// The chat (spec 0006, AC-2, AC-4, AC-18). The first send creates the
// conversation; its id arrives in the first stream event's metadata and moves
// the address bar to `/assistant/c/<id>` without a navigation, so the reply
// keeps streaming.
export function ChatView({
  conversationId: initialConversationId,
  initialMessages,
  initialCards,
  initialRemaining,
}: {
  conversationId?: string;
  initialMessages: AssistantUIMessage[];
  initialCards: Record<string, ChatCard>;
  // Messages left today; null for agents, who have no limit (AC-9).
  initialRemaining: number | null;
}) {
  const [cards, setCards] = useState(initialCards);
  const [input, setInput] = useState("");
  const [announcement, setAnnouncement] = useState("");
  // Replies this visitor stopped in this session; on reload the saved
  // `metadata.stopped` says the same.
  const [stoppedIds, setStoppedIds] = useState<string[]>([]);
  const loading = useRef(new Set<string>());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // What to restore if the server refuses a send or a Retry (nothing was saved).
  const lastSent = useRef("");
  const beforeRetry = useRef<AssistantUIMessage[] | null>(null);

  const { messages, sendMessage, regenerate, stop, setMessages, status, error, clearError } = useChat<AssistantUIMessage>({
    id: initialConversationId ?? "new",
    messages: initialMessages,
    transport,
    // The finished reply is announced once, not word by word (AC-17), without
    // the bold markers a screen reader would read out.
    onFinish: ({ message }) => setAnnouncement(messageText(message).replace(/\*\*/g, "")),
    onError: (failure) => {
      // A refusal (limit, turn in progress) saved nothing: put things back.
      if (chatErrorReason(failure) === "failed") return;
      if (beforeRetry.current) {
        setMessages(beforeRetry.current);
      } else {
        setMessages((current) => (current.at(-1)?.role === "user" ? current.slice(0, -1) : current));
        setInput(lastSent.current);
      }
    },
  });
  const busy = status === "submitted" || status === "streaming";

  // The page's conversation, or the one the first reply created.
  const conversationId =
    initialConversationId ?? messages.findLast((message) => message.metadata?.conversationId)?.metadata?.conversationId;

  // Once the first reply names the conversation, the address bar follows.
  useEffect(() => {
    const path = conversationId ? `/assistant/c/${conversationId}` : null;
    if (path && window.location.pathname !== path) window.history.replaceState(null, "", path);
  }, [conversationId]);

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

  const send = () => {
    const text = input.trim();
    if (!text || text.length > maxMessageLength || busy) return;
    clearError();
    setInput("");
    lastSent.current = text;
    beforeRetry.current = null;
    void sendMessage({ text }, { body: { conversationId } });
  };

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

  const errorReason = chatErrorReason(error);
  // Retry shows only on an interrupted reply: saved as one, flagged by the
  // stream's finish, or cut off by a failed stream (AC-10).
  const last = messages.at(-1);
  const retryableId =
    !busy && last?.role === "assistant" && (last.metadata?.interrupted || errorReason === "failed") ? last.id : null;

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col">
      <div className="flex-1 py-8">
        {messages.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface-raised p-6 shadow-soft">
            <Sparkles aria-hidden="true" strokeWidth={1.5} className="h-5 w-5 text-accent" />
            <p className="text-fg">
              Hello, I&apos;m the Aurevia Assistant. Tell me your budget, the areas you like, and how your family lives,
              and I&apos;ll find homes that fit.
            </p>
          </div>
        ) : (
          <ol className="flex flex-col gap-6">
            {messages.map((message) => (
              <li key={message.id}>
                <Message
                  message={message}
                  cards={cards}
                  onAskAbout={askAbout}
                  stopped={stoppedIds.includes(message.id)}
                  onRetry={message.id === retryableId ? () => retry(message.id) : undefined}
                />
              </li>
            ))}
          </ol>
        )}
        {status === "submitted" ? (
          <p className="mt-6 flex items-center gap-2 text-sm text-fg-muted" role="status">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden="true" />
            The assistant is thinking…
          </p>
        ) : null}
      </div>

      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <form onSubmit={onSubmit} className="sticky bottom-0 bg-surface pt-2 pb-6">
        {errorReason ? (
          <p role="alert" className="mb-3 flex items-start gap-2 rounded-xl bg-danger-subtle px-4 py-3 text-sm text-danger-subtle-fg">
            <CircleAlert aria-hidden="true" strokeWidth={1.5} className="mt-0.5 h-4 w-4 shrink-0" />
            {chatErrorMessages[errorReason]}
          </p>
        ) : null}
        <div className="flex items-end gap-3 rounded-2xl border border-line-strong bg-surface-raised p-2 shadow-soft">
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
        {remaining !== null && remaining <= remainingShownFrom ? (
          <p className="mt-2 text-xs text-fg-subtle">
            {remaining === 1 ? "1 message" : `${remaining} messages`} left today. It resets at midnight, Bangladesh time.
          </p>
        ) : null}
      </form>
    </div>
  );
}

function Message({
  message,
  cards,
  onAskAbout,
  stopped,
  onRetry,
}: {
  message: AssistantUIMessage;
  cards: Record<string, ChatCard>;
  onAskAbout: (refCode: string) => void;
  stopped: boolean;
  onRetry?: () => void;
}) {
  if (message.role === "user") {
    const text = messageText(message);
    return (
      <div className="flex justify-end">
        <p
          lang={replyLocale(text, "en") === "bn" ? "bn" : undefined}
          className="max-w-[85%] rounded-2xl bg-accent px-4 py-3 whitespace-pre-line text-on-accent"
        >
          {text}
        </p>
      </div>
    );
  }

  if (message.role === "system") {
    return <p className="text-center text-sm text-fg-subtle">{messageText(message)}</p>;
  }

  const metadata = message.metadata;
  return (
    <div className="flex flex-col gap-4">
      {message.parts.map((part, i) => {
        if (part.type === "text") {
          if (!part.text.trim()) return null;
          return (
            <div key={i} lang={replyLocale(part.text, "en") === "bn" ? "bn" : undefined} className="max-w-[85%] text-fg">
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
        const shown = shownCards(part);
        if (shown.length > 0) {
          return (
            <div key={i} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shown.slice(0, cardsPerReply).map((card) => (
                <MatchCardView key={card.listingId} match={card} data={cards[card.listingId]} onAskAbout={onAskAbout} />
              ))}
            </div>
          );
        }
        return null;
      })}
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
    </div>
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
