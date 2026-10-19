import type { UIMessage } from "ai";
import type { ChatLocale } from "@/lib/domain/chat-text";
import type { MatchCard } from "@/lib/domain/match-score";

// The chat's message shape on the client (spec 0006). Stream metadata carries
// `conversationId` on start and `remaining` on finish; stored messages also
// carry the saved flags.
export type ChatMetadata = {
  conversationId?: string;
  remaining?: number;
  locale?: ChatLocale;
  interrupted?: boolean;
  stopped?: boolean;
  ungrounded?: boolean;
  results?: { briefVersion: string | null; nextPage: number; total: number };
};

export type ChatUIMessage = UIMessage<ChatMetadata>;

// What a results part holds: `tool-searchListings` output or `data-matches` data.
export type ResultsData = { cards: MatchCard[]; total: number; hasMore: boolean; exactCount?: number; updatedBrief?: true };

// Refusal bodies from `POST /api/chat` (AC-9, AC-12).
export type ChatRefusal = { reason: string; resetsAt?: string };
