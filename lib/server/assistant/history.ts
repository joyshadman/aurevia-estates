import "server-only";
import { convertToModelMessages, type InferUITools, type ModelMessage, type UIMessage } from "ai";
import type { ChatLocale } from "@/lib/domain/bangla";
import { formatViewingTime } from "@/lib/domain/viewing-slots";
import { offerViewingSummary, type AssistantTools, type MatchesOutput, type OfferViewingOutput } from "@/lib/server/assistant/tools";
import type { ChatMessageInput } from "@/lib/server/chat-store";
import type { ViewingNote } from "@/lib/server/viewing-cards";

// Chat message shapes and the history the model reads (spec 0006).

export type ChatMetadata = {
  conversationId?: string;
  locale?: ChatLocale;
  interrupted?: true;
  stopped?: true;
  ungrounded?: true;
  usage?: { inputTokens: number; outputTokens: number };
  results?: { briefVersion: string | null; nextPage: number; total: number };
  remaining?: number;
};

// `viewing` is a booking's confirmation card (spec 0007), saved with no model call.
export type ChatDataParts = {
  matches: MatchesOutput & { label?: string };
  viewing: { leadId: string; viewingId: string };
};

export type AssistantUIMessage = UIMessage<ChatMetadata, ChatDataParts, InferUITools<AssistantTools>>;

export const historyLimit = 30;
// Tool results stay whole in this many latest assistant messages.
const fullToolResults = 2;

type Part = ChatMessageInput["parts"][number];

const shownCodes = (output: unknown) =>
  ((output as Partial<MatchesOutput> | undefined)?.cards ?? []).map((card) => card.refCode);

// An old tool part as one short line, so long chats stay cheap.
function summarizeToolPart(part: Part): Part | null {
  if (part.state !== "output-available") return null;
  if (part.type === "tool-searchListings") {
    const codes = shownCodes(part.output);
    return { type: "text", text: codes.length > 0 ? `(Showed homes: ${codes.join(", ")}.)` : "(Searched: no homes found.)" };
  }
  if (part.type === "tool-getListingDetails") {
    const code = (part.input as { refCode?: string } | undefined)?.refCode;
    return code ? { type: "text", text: `(Looked up details of ${code}.)` } : null;
  }
  if (part.type === "tool-offerViewing") {
    return { type: "text", text: `(${offerViewingSummary(part.output as OfferViewingOutput)})` };
  }
  // The stored brief is in the system prompt; old brief updates add nothing.
  return null;
}

function isShowMore(message: ChatMessageInput) {
  return message.role === "assistant" && message.parts.some((part) => part.type === "data-matches");
}

function viewingLeadId(message: ChatMessageInput): string | null {
  const part = message.parts.find((candidate) => candidate.type === "data-viewing");
  const leadId = (part?.data as { leadId?: unknown } | undefined)?.leadId;
  return typeof leadId === "string" ? leadId : null;
}

// AC-13: a booking as a note built from the lead's current viewing.
function viewingNoteText(note: ViewingNote | undefined): string | null {
  if (!note) return null;
  return `Viewing for ${note.refCode}: ${formatViewingTime(note.start)} Sylhet, status ${note.status}.`;
}

// Stored messages (oldest first, at most `historyLimit`) to model messages.
// `viewingNotes` holds each booked lead's current viewing (spec 0007, AC-13).
export async function modelHistory(
  messages: ChatMessageInput[],
  tools: AssistantTools,
  viewingNotes: Map<string, ViewingNote> = new Map(),
): Promise<ModelMessage[]> {
  const assistantIds = messages.filter((message) => message.role === "assistant").map((message) => message.id);
  const recent = new Set(assistantIds.slice(-fullToolResults));

  // Only the newest confirmation card per lead becomes a note: a lead can
  // collect two after a cancel and rebook.
  const newestCard = new Map<string, string>();
  for (const message of messages) {
    const leadId = viewingLeadId(message);
    if (leadId) newestCard.set(leadId, message.id);
  }

  const converted = messages.flatMap((message): Omit<AssistantUIMessage, "id">[] => {
    const leadId = viewingLeadId(message);
    if (leadId) {
      const text = newestCard.get(leadId) === message.id ? viewingNoteText(viewingNotes.get(leadId)) : null;
      return text ? [{ role: "user", parts: [{ type: "text", text: `<note>${text}</note>` }] }] : [];
    }
    if (message.role === "system") {
      const text = message.parts.map((part) => (part.type === "text" ? String(part.text) : "")).join("\n");
      // Mid conversation system messages confuse models; a tagged user note does not.
      return [{ role: "user", parts: [{ type: "text", text: `<note>${text}</note>` }] }];
    }
    if (isShowMore(message)) {
      const codes = message.parts.flatMap((part) => (part.type === "data-matches" ? shownCodes(part.data) : []));
      return [{ role: "assistant", parts: [{ type: "text", text: `Showed more homes: ${codes.join(", ")}.` }] }];
    }
    const parts = message.parts.flatMap((part): Part[] => {
      // Reasoning is never stored or sent back.
      if (part.type === "reasoning") return [];
      if (part.type.startsWith("tool-") && message.role === "assistant" && !recent.has(message.id)) {
        const summary = summarizeToolPart(part);
        return summary ? [summary] : [];
      }
      return [part];
    });
    return [{ role: message.role, parts: parts as AssistantUIMessage["parts"] }];
  });

  return convertToModelMessages<AssistantUIMessage>(converted, { tools, ignoreIncompleteToolCalls: true });
}
