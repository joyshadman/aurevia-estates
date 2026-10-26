import "server-only";
import { isStepCount, streamText, toUIMessageStream, type FinishReason, type UIMessageStreamOutcome } from "ai";
import { z } from "zod";
import { replyLocale, type ChatLocale } from "@/lib/domain/bangla";
import { dhakaToday } from "@/lib/domain/viewing-slots";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  chatLimitResetsAt,
  dailyMessageLimit,
  recordUsage,
  refundChatSlot,
  reserveChatSlot,
  type ChatSlot,
} from "@/lib/server/ai-usage";
import { briefView, loadAssistantReference, loadBrief } from "@/lib/server/assistant/brief";
import { liveFactSheet } from "@/lib/server/assistant/fact-sheet";
import { checkGrounding, shownListingIdsFor } from "@/lib/server/assistant/grounding";
import { historyLimit, modelHistory, type AssistantUIMessage, type ChatMetadata } from "@/lib/server/assistant/history";
import { chatModel } from "@/lib/server/assistant/model";
import { buildSystemPrompt } from "@/lib/server/assistant/system-prompt";
import { assistantTools, listingDetails, listingDetailsInclude, type MatchesOutput } from "@/lib/server/assistant/tools";
import type { Actor } from "@/lib/server/auth";
import {
  saveNewUserMessage,
  saveServerMessage,
  textContent,
  turnGuardSeconds,
  type ChatMessageInput,
} from "@/lib/server/chat-store";
import { db } from "@/lib/server/db";
import { DuplicateMessageError, TurnRefusedError } from "@/lib/server/errors";
import { reportError, reportEvent } from "@/lib/server/report";
import { uuidv7 } from "@/lib/server/uuid";
import { viewingLeadIds, viewingNotes } from "@/lib/server/viewing-cards";

// One chat turn (spec 0006, *The chat turn*): the HTTP route and the eval both
// call `runAssistantTurn`. The caller must consume `stream` to the end (the
// route via `consumeSseStream`); `saved` settles once the reply is stored.

export const maxMessageLength = 2000;
const maxSteps = 5;
const maxOutputTokensPerStep = 1200;
const modelTimeoutMs = 55_000;
// The starting listing enters the prompt only at the start of a chat.
const startingListingTurns = 2;
// How often a running reply checks for Stop (step 7).
const stopCheckMs = 1000;

export const turnInput = z.object({
  conversationId: z.uuid().optional(),
  message: z.object({
    id: z.string().min(1).max(100),
    role: z.literal("user"),
    parts: z
      .array(z.object({ type: z.literal("text"), text: z.string() }))
      .length(1)
      .refine(([part]) => part.text.trim().length >= 1 && part.text.trim().length <= maxMessageLength, {
        message: `Messages are 1 to ${maxMessageLength} characters`,
      }),
  }),
  locale: z.enum(["en", "bn"]),
  startListingSlug: z.string().max(200).optional(),
});

export type TurnTrigger = "submit-message" | "regenerate-message";

export type TurnInput = z.infer<typeof turnInput> & {
  user: Actor;
  // Retry of an interrupted reply: regenerates `regenerateMessageId` in place (AC-10).
  trigger?: TurnTrigger;
  regenerateMessageId?: string;
  // Eval only: a fact sheet fixture instead of the live version.
  factSheetBody?: string;
};

export type TurnOutcome = "finished" | "interrupted" | "stopped";

export type SavedTurn = {
  conversationId: string;
  message: AssistantUIMessage;
  outcome: TurnOutcome;
  ungroundedCodes: string[];
  usage: { inputTokens: number; outputTokens: number };
  // The OpenRouter upstream provider of each model call.
  providers: string[];
};

// Steps 3 to 5: conversation, ownership, turn guard, and the user message (or
// the Retry check), in one transaction holding the conversation row lock.
async function openTurn(input: TurnInput) {
  return db.$transaction(async (tx) => {
    let conversationId = input.conversationId;
    if (!conversationId) {
      if (input.trigger === "regenerate-message") throw new TurnRefusedError(409, "not_retryable");
      const startListing = input.startListingSlug
        ? await tx.listing.findFirst({ where: { slug: input.startListingSlug, status: "PUBLISHED" }, select: { id: true } })
        : null;
      const created = await tx.conversation.create({
        data: { id: uuidv7(), userId: input.user.id, startListingId: startListing?.id ?? null },
        select: { id: true },
      });
      conversationId = created.id;
    } else {
      const [row] = await tx.$queryRaw<{ user_id: string; busy: boolean }[]>`
        SELECT user_id, coalesce(turn_started_at > now() - make_interval(secs => ${turnGuardSeconds}), false) AS busy
        FROM conversations WHERE id = ${conversationId}::uuid FOR UPDATE`;
      if (!row || row.user_id !== input.user.id) throw new TurnRefusedError(404, "not_found");
      if (row.busy) throw new TurnRefusedError(409, "turn_in_progress");
    }

    await tx.$executeRaw`UPDATE conversations SET turn_started_at = now() WHERE id = ${conversationId}::uuid`;

    if (input.trigger === "regenerate-message") {
      // Retry only the conversation's latest message, an interrupted reply (AC-10).
      const [latest] = await tx.$queryRaw<{ id: string; role: string; interrupted: boolean }[]>`
        SELECT id, role::text AS role, coalesce((metadata->>'interrupted')::boolean, false) AS interrupted
        FROM chat_messages WHERE conversation_id = ${conversationId}::uuid ORDER BY seq DESC LIMIT 1`;
      if (!latest || latest.id !== input.regenerateMessageId || latest.role !== "ASSISTANT" || !latest.interrupted) {
        throw new TurnRefusedError(409, "not_retryable");
      }
      return conversationId;
    }

    try {
      await saveNewUserMessage(tx, conversationId, input.message);
    } catch (error) {
      if (error instanceof DuplicateMessageError) throw new TurnRefusedError(409, "duplicate_message");
      throw error;
    }
    return conversationId;
  });
}

async function loadHistory(conversationId: string, without?: string): Promise<ChatMessageInput[]> {
  const rows = await db.chatMessage.findMany({
    where: { conversationId, ...(without ? { id: { not: without } } : {}) },
    orderBy: { seq: "desc" },
    take: historyLimit,
  });
  return rows.reverse().map((row) => ({
    id: row.id,
    role: row.role.toLowerCase() as ChatMessageInput["role"],
    parts: row.parts as ChatMessageInput["parts"],
    ...(row.metadata === null ? {} : { metadata: row.metadata }),
  }));
}

async function startingListing(conversationId: string, history: ChatMessageInput[]) {
  if (history.filter((message) => message.role === "assistant").length >= startingListingTurns) return null;
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    select: { startListing: { include: listingDetailsInclude } },
  });
  const listing = conversation?.startListing;
  return listing?.status === "PUBLISHED" ? listingDetails(listing) : null;
}

// Step 7: Stop counts only when pressed after this reply began.
async function stopRequested(conversationId: string): Promise<boolean> {
  const [row] = await db.$queryRaw<{ stop: boolean }[]>`
    SELECT coalesce(stop_requested_at > turn_started_at, false) AS stop FROM conversations WHERE id = ${conversationId}::uuid`;
  return row?.stop === true;
}

export async function runAssistantTurn(input: TurnInput) {
  const parsed = turnInput.parse(input);
  const trigger = input.trigger ?? "submit-message";

  // Step 2: a visitor reserves one of today's messages before anything else is
  // written; at the limit nothing is saved and the model is not called (AC-9).
  // A successful Retry counts as a message too.
  const slot = input.user.role === "VISITOR" ? await reserveChatSlot(input.user.id) : null;
  if (input.user.role === "VISITOR" && !slot) {
    throw new TurnRefusedError(429, "daily_limit", { resetsAt: chatLimitResetsAt() });
  }
  const refund = async () => {
    if (slot) await refundChatSlot(input.user.id, slot).catch((error: unknown) => reportError("assistant.refund_failed", error));
  };

  let conversationId: string;
  try {
    conversationId = await openTurn({ ...input, ...parsed, trigger });
  } catch (error) {
    await refund();
    throw error;
  }

  const stopWatch: { timer?: ReturnType<typeof setInterval>; stopped: boolean } = { stopped: false };
  try {
    const regenerateId = trigger === "regenerate-message" ? input.regenerateMessageId : undefined;
    const [history, reference, brief, factSheet] = await Promise.all([
      // A Retry drops the interrupted reply from what the model reads.
      loadHistory(conversationId, regenerateId),
      loadAssistantReference(),
      loadBrief(conversationId),
      input.factSheetBody === undefined ? liveFactSheet().then((sheet) => sheet?.body ?? null) : input.factSheetBody,
    ]);
    const scope = { conversationId, user: input.user, shownThisTurn: new Set<string>() };
    const tools = assistantTools(scope);
    // The visitor message this reply answers: the new one, or on Retry the latest stored.
    const latestUserText =
      trigger === "regenerate-message"
        ? textContent((history.findLast((message) => message.role === "user")?.parts ?? []) as ChatMessageInput["parts"])
        : parsed.message.parts[0].text;
    const instructions = buildSystemPrompt({
      // AC-8: Bangla script → Bangla; Latin letters (English or romanized
      // Bangla) → English; no letters → the toggle.
      replyLanguage: replyLocale(latestUserText, parsed.locale),
      today: dhakaToday(),
      reference,
      factSheet,
      brief: briefView(brief, reference),
      startingListing: await startingListing(conversationId, history),
    });

    // Stop (step 7) aborts the model call; the reply is saved as it stands.
    const abort = new AbortController();
    let checking = false;
    stopWatch.timer = setInterval(() => {
      if (checking || abort.signal.aborted) return;
      checking = true;
      stopRequested(conversationId)
        .then((stop) => {
          if (!stop) return;
          stopWatch.stopped = true;
          abort.abort();
        })
        .catch((error: unknown) => reportError("assistant.stop_check_failed", error, { conversationId }))
        .finally(() => (checking = false));
    }, stopCheckMs);

    const usage = { inputTokens: 0, outputTokens: 0 };
    const providers: string[] = [];
    const result = streamText({
      model: chatModel(),
      instructions,
      // AC-13 (spec 0007): a second query for the bookings in these messages.
      messages: await modelHistory(history, tools, await viewingNotes(input.user.id, viewingLeadIds(history))),
      tools,
      toolCallConcurrency: 1,
      stopWhen: isStepCount(maxSteps),
      maxOutputTokens: maxOutputTokensPerStep,
      timeout: { totalMs: modelTimeoutMs },
      abortSignal: abort.signal,
      onStepEnd: (step) => {
        usage.inputTokens += step.usage.inputTokens ?? 0;
        usage.outputTokens += step.usage.outputTokens ?? 0;
        const provider = (step.providerMetadata?.openrouter as { provider?: unknown } | undefined)?.provider;
        if (typeof provider === "string") providers.push(provider);
      },
      onError: ({ error }) => reportError("assistant.model_error", error, { conversationId }),
    });

    // A Retry keeps the interrupted reply's id, so it is replaced in place.
    const messageId = regenerateId ?? uuidv7();
    let settle!: { resolve: (turn: SavedTurn) => void; reject: (error: unknown) => void };
    const saved = new Promise<SavedTurn>((resolve, reject) => (settle = { resolve, reject }));

    const stream = toUIMessageStream<typeof tools, AssistantUIMessage>({
      stream: result.stream,
      tools,
      originalMessages: trigger === "regenerate-message" ? [] : [parsed.message as AssistantUIMessage],
      generateMessageId: () => messageId,
      sendReasoning: false,
      messageMetadata: ({ part }): ChatMetadata | undefined => {
        if (part.type === "start") return { conversationId };
        if (part.type !== "finish") return undefined;
        // The client learns at once whether the reply was cut short (it gets
        // Retry, and its slot comes back), and how many messages are left.
        const cut = part.finishReason === "length" || part.finishReason === "error";
        return {
          ...(cut ? { interrupted: true as const } : {}),
          ...(slot ? { remaining: dailyMessageLimit - slot.used + (cut ? 1 : 0) } : {}),
        };
      },
      onError: () => "The assistant could not finish this reply.",
      onEnd: async ({ responseMessage, finishReason, outcome }) => {
        clearInterval(stopWatch.timer);
        try {
          settle.resolve(
            await saveAssistantTurn({
              conversationId,
              user: input.user,
              slot,
              message: responseMessage,
              finishReason,
              outcome,
              stopped: stopWatch.stopped,
              locale: parsed.locale,
              usage,
              providers,
              shownThisTurn: scope.shownThisTurn,
            }),
          );
        } catch (error) {
          reportError("assistant.save_failed", error, { conversationId, messageId });
          await releaseTurn(conversationId);
          settle.reject(error);
        }
      },
    });

    return { conversationId, messageId, stream, saved };
  } catch (error) {
    clearInterval(stopWatch.timer);
    await releaseTurn(conversationId);
    await refund();
    throw error;
  }
}

async function releaseTurn(conversationId: string) {
  await db.$executeRaw`UPDATE conversations SET turn_started_at = NULL WHERE id = ${conversationId}::uuid`.catch(
    (error: unknown) => reportError("assistant.release_failed", error, { conversationId }),
  );
}

type FinishInput = {
  conversationId: string;
  user: Actor;
  slot: ChatSlot | null;
  message: AssistantUIMessage;
  finishReason: FinishReason | undefined;
  outcome: UIMessageStreamOutcome;
  // Ended by the visitor's Stop, not by a failure.
  stopped: boolean;
  locale: ChatLocale;
  usage: SavedTurn["usage"];
  providers: string[];
  shownThisTurn: Set<string>;
};

// Step 9: one transaction under the conversation lock, for every outcome.
// Finished and stopped replies keep their slot; an interrupted one (error,
// timeout, or the output limit) gets it back. Tokens are recorded either way.
async function saveAssistantTurn(finish: FinishInput): Promise<SavedTurn> {
  const { conversationId } = finish;
  const stopped = finish.stopped && finish.outcome.status === "aborted";
  const interrupted =
    !stopped && (finish.outcome.status !== "completed" || finish.finishReason === "length" || finish.finishReason === "error");
  if (finish.outcome.status === "failed") {
    reportError("assistant.model_error", finish.outcome.error, { conversationId, messageId: finish.message.id });
  } else if (interrupted) {
    reportEvent("assistant.interrupted", { conversationId, messageId: finish.message.id, finishReason: finish.finishReason });
  }

  const parts = finish.message.parts.filter((part) => part.type !== "reasoning");
  const text = textContent(parts as ChatMessageInput["parts"]);
  const searches = parts.filter((part) => part.type === "tool-searchListings" && part.state === "output-available");
  const lastResults = searches.at(-1) as { output: MatchesOutput } | undefined;

  return db.$transaction(async (tx: Prisma.TransactionClient): Promise<SavedTurn> => {
    await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${conversationId}::uuid FOR UPDATE`;

    const shown = await shownListingIdsFor(tx, conversationId, [...finish.shownThisTurn]);
    const ungroundedCodes = await checkGrounding(tx, text, shown);
    if (ungroundedCodes.length > 0) {
      reportEvent("assistant.ungrounded", { conversationId, messageId: finish.message.id, codes: ungroundedCodes });
    }

    const metadata: ChatMetadata = {
      locale: replyLocale(text, finish.locale),
      usage: finish.usage,
      ...(interrupted ? { interrupted: true } : {}),
      ...(stopped ? { stopped: true } : {}),
      ...(ungroundedCodes.length > 0 ? { ungrounded: true } : {}),
      ...(lastResults
        ? { results: { briefVersion: lastResults.output.briefVersion, nextPage: 1, total: lastResults.output.total } }
        : {}),
    };
    const message = { ...finish.message, parts, metadata } as AssistantUIMessage;
    await saveServerMessage(tx, conversationId, message as ChatMessageInput);
    await recordUsage(finish.user.id, { messages: 0, ...finish.usage }, tx);
    if (interrupted && finish.slot) await refundChatSlot(finish.user.id, finish.slot, tx);
    await tx.$executeRaw`UPDATE conversations SET turn_started_at = NULL WHERE id = ${conversationId}::uuid`;

    return {
      conversationId,
      message,
      outcome: stopped ? "stopped" : interrupted ? "interrupted" : "finished",
      ungroundedCodes,
      usage: finish.usage,
      providers: finish.providers,
    };
  });
}
