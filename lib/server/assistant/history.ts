import "server-only";
import { convertToModelMessages, type ModelMessage, type ToolSet, type UIMessage } from "ai";
import type { ChatMessageInput } from "@/lib/server/chat-store";

// Stored messages to model input (spec 0006, *Prompt and context*):
// - the last 30 messages, in `seq` order;
// - tool results older than the latest 2 assistant messages become a short
//   summary of the codes shown;
// - SYSTEM notes become user text in `<note>` tags;
// - Show more messages become "Showed more homes: ...";
// - reasoning is never sent back.

export const historyLimit = 30;
const recentAssistantMessages = 2;

type Part = ChatMessageInput["parts"][number];

function codesIn(output: unknown): string[] {
  const cards = (output as { cards?: { refCode?: unknown }[] } | undefined)?.cards ?? [];
  return cards.flatMap((card) => (typeof card.refCode === "string" ? [card.refCode] : []));
}

function text(value: string): Part {
  return { type: "text", text: value };
}

function summarizeOld(parts: Part[]): Part[] {
  const codes: string[] = [];
  const kept: Part[] = [];
  for (const part of parts) {
    if (part.type === "tool-searchListings") codes.push(...codesIn(part.output));
    else if (part.type === "data-matches") codes.push(...codesIn(part.data));
    else if (!part.type.startsWith("tool-")) kept.push(part);
  }
  return codes.length > 0 ? [...kept, text(`(Showed homes: ${[...new Set(codes)].join(", ")}.)`)] : kept;
}

function toUIMessage(message: ChatMessageInput, summarize: boolean): UIMessage | null {
  let parts = message.parts.filter((part) => part.type !== "reasoning" && part.type !== "step-start");

  if (message.role === "system") {
    const note = parts.flatMap((p) => (p.type === "text" ? [String(p.text)] : [])).join(" ");
    return { id: message.id, role: "user", parts: [{ type: "text", text: `<note>${note}</note>` }] };
  }

  if (message.role === "assistant") {
    const isShowMore = parts.length > 0 && parts.every((p) => p.type === "data-matches");
    if (isShowMore) {
      const codes = parts.flatMap((p) => codesIn(p.data));
      parts = [text(`Showed more homes: ${codes.join(", ")}.`)];
    } else if (summarize) {
      parts = summarizeOld(parts);
    } else {
      // Data parts are for the client only.
      parts = parts.filter((p) => !p.type.startsWith("data-"));
    }
  }

  if (parts.length === 0) return null;
  return { id: message.id, role: message.role, parts } as UIMessage;
}

export async function toModelHistory(messages: ChatMessageInput[], tools: ToolSet): Promise<ModelMessage[]> {
  const recent = messages.slice(-historyLimit);
  const assistantIndexes = recent.flatMap((m, i) => (m.role === "assistant" ? [i] : []));
  const keepFullFrom = assistantIndexes.at(-recentAssistantMessages) ?? 0;

  const ui = recent.flatMap((message, index) => {
    const converted = toUIMessage(message, message.role === "assistant" && index < keepFullFrom);
    return converted ? [converted] : [];
  });
  // Interrupted replies may end mid tool call; those calls are left out.
  return convertToModelMessages(ui, { tools, ignoreIncompleteToolCalls: true });
}
