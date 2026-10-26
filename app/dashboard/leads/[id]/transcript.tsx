"use client";

import { Bot, Info, LayoutGrid, User } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import type { TranscriptMessage } from "@/lib/server/lead-inbox";
import { loadTranscript } from "../actions";
import { leadMessages } from "../messages";

const speakers = {
  USER: { label: "Visitor", icon: User },
  ASSISTANT: { label: "Assistant", icon: Bot },
  SYSTEM: { label: "Note", icon: Info },
} as const;

// The buyer's chat, read only (spec 0009, AC-14): the latest 30 messages, and
// 30 more on each "Show earlier". Nothing here can be acted on.
export function TranscriptView({
  leadId,
  initial,
}: {
  leadId: string;
  initial: { messages: TranscriptMessage[]; earliestSeq: number | null; hasEarlier: boolean };
}) {
  const [messages, setMessages] = useState(initial.messages);
  const [earliestSeq, setEarliestSeq] = useState(initial.earliestSeq);
  const [hasEarlier, setHasEarlier] = useState(initial.hasEarlier);
  const [pending, startTransition] = useTransition();

  const showEarlier = () =>
    startTransition(async () => {
      if (earliestSeq === null) return;
      const result = await loadTranscript({ leadId, beforeSeq: earliestSeq });
      if (!result.ok) {
        toast({ tone: "danger", title: leadMessages[result.reason] });
        return;
      }
      if (!result.transcript || result.transcript.deleted) {
        setHasEarlier(false);
        return;
      }
      const page = result.transcript;
      setMessages((current) => [...page.messages, ...current]);
      setEarliestSeq(page.earliestSeq);
      setHasEarlier(page.hasEarlier);
    });

  const shown = messages.filter((message) => message.lines.length > 0);

  if (shown.length === 0 && !hasEarlier) {
    return <p className="text-sm text-fg-muted">The conversation has no messages yet.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {hasEarlier ? (
        <Button type="button" intent="ghost" size="sm" onClick={showEarlier} loading={pending} disabled={pending} className="self-center">
          Show earlier
        </Button>
      ) : null}
      <ol className="flex flex-col gap-4" aria-label="Chat transcript">
        {shown.map((message) => {
          const speaker = speakers[message.role];
          const Icon = speaker.icon;
          return (
            <li key={message.id} className="flex gap-3">
              <span
                aria-hidden="true"
                className={cn(
                  "grid h-8 w-8 shrink-0 place-items-center rounded-full",
                  message.role === "USER" ? "bg-accent-subtle text-accent-subtle-fg" : "bg-surface-sunken text-fg-muted",
                )}
              >
                <Icon strokeWidth={1.5} className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-fg-subtle">{speaker.label}</p>
                <div className="mt-1 flex flex-col gap-2">
                  {message.lines.map((line, index) =>
                    line.kind === "card" ? (
                      <p
                        key={index}
                        className="flex items-center gap-2 self-start rounded-full border border-line px-3 py-1 text-xs text-fg-muted"
                      >
                        <LayoutGrid aria-hidden="true" strokeWidth={1.5} className="h-3.5 w-3.5" />
                        {line.text}
                      </p>
                    ) : (
                      <p
                        key={index}
                        className={cn(
                          "text-sm break-words whitespace-pre-wrap",
                          message.role === "SYSTEM" ? "text-fg-muted italic" : "text-fg",
                        )}
                      >
                        {line.text}
                      </p>
                    ),
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
