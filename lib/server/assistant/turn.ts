import "server-only";
import { generateId, isStepCount, streamText, type LanguageModel, type UIMessage, type UIMessageChunk } from "ai";
import { z } from "zod";
import { detectLocale, type ChatLocale } from "@/lib/domain/chat-text";
import { dailyMessageLimit, limitResetsAt, recordUsage, refundMessageSlot, reserveMessageSlot } from "@/lib/server/ai-usage";
import type { CurrentUser } from "@/lib/server/auth";
import { briefForModel, liveFactSheet, loadReferenceData } from "@/lib/server/assistant/context";
import { checkGrounding } from "@/lib/server/assistant/grounding";
import { historyLimit, toModelHistory } from "@/lib/server/assistant/history";
import { chatModel, ModelNotConfiguredError } from "@/lib/server/assistant/model";
import { buildInstructions, dhakaToday } from "@/lib/server/assistant/system-prompt";
import { createAssistantTools, listingFacts, loadShownListingIds, type SearchListingsOutput } from "@/lib/server/assistant/tools";
import { loadBrief } from "@/lib/server/briefs";
import { insertUserMessage, saveServerMessage, textContent, type ChatMessageInput } from "@/lib/server/chat-store";
import { db } from "@/lib/server/db";
import { reportError, reportEvent } from "@/lib/server/report";

// One assistant reply (spec 0006, *The chat turn*). The HTTP route (milestone 2)
// and the eval both call `runAssistantTurn`. It returns a refusal, or the UI
// message stream plus `done`, which settles once the reply is saved. Read the
// stream to the end (the route does it with `consumeSseStream`), or `done`
// never settles.

export const maxMessageLength = 2000;
const maxSteps = 5;
const maxOutputTokensPerStep = 1200;
const replyTimeoutMs = 55_000;
const stopPollMs = 1000;

export type TurnRequest = {
  user: CurrentUser;
  conversationId?: string;
  message: ChatMessageInput;
  locale: ChatLocale;
  trigger: "submit-message" | "regenerate-message";
  regenerateMessageId?: string;
  startListingSlug?: string;
};

// Test and eval hooks. Production passes none of them.
export type TurnOptions = {
  model?: LanguageModel;
  factSheet?: string;
  timeoutMs?: number;
};

export type TurnRefusal = {
  ok: false;
  status: 400 | 404 | 409 | 429 | 503;
  reason: "invalid" | "not_found" | "turn_in_progress" | "duplicate_message" | "not_retryable" | "daily_limit" | "assistant_unavailable";
  resetsAt?: string;
};

// Metadata the client receives on the stream: the new conversation id on start,
// and the messages left today on finish (visitors only).
export type AssistantStreamMetadata = { conversationId?: string; remaining?: number };
export type AssistantUIMessage = UIMessage<AssistantStreamMetadata>;

export type TurnOutcome = "finished" | "stopped" | "interrupted";

export type TurnResult = {
  outcome: TurnOutcome;
  message: ChatMessageInput;
  ungrounded: string[];
  usage: { inputTokens: number; outputTokens: number };
  remaining: number | null;
  // OpenRouter upstream providers that served the steps (for the eval report).
  providers: string[];
};

export type TurnStarted = {
  ok: true;
  conversationId: string;
  messageId: string;
  stream: ReadableStream<UIMessageChunk<AssistantStreamMetadata>>;
  done: Promise<TurnResult>;
};

class TurnRefused extends Error {
  constructor(readonly refusal: TurnRefusal) {
    super(refusal.reason);
  }
}

const refuse = (status: TurnRefusal["status"], reason: TurnRefusal["reason"]): TurnRefusal => ({ ok: false, status, reason });

// Steps 3 to 5 in one transaction: the conversation (created or locked), the
// turn guard, and the visitor's message.
async function openTurn(request: TurnRequest): Promise<string> {
  const { user } = request;
  return db.$transaction(async (tx) => {
    let conversationId = request.conversationId;

    if (!conversationId) {
      const start = request.startListingSlug
        ? await tx.listing.findFirst({ where: { slug: request.startListingSlug, status: "PUBLISHED" }, select: { id: true } })
        : null;
      const created = await tx.conversation.create({
        data: { userId: user.id, startListingId: start?.id ?? null, turnStartedAt: new Date() },
        select: { id: true },
      });
      conversationId = created.id;
    } else {
      if (!z.uuid().safeParse(conversationId).success) throw new TurnRefused(refuse(404, "not_found"));
      const [row] = await tx.$queryRaw<{ user_id: string; busy: boolean }[]>`
        SELECT user_id, coalesce(turn_started_at > now() - interval '90 seconds', false) AS busy
        FROM conversations WHERE id = ${conversationId}::uuid FOR UPDATE`;
      if (!row || row.user_id !== user.id) throw new TurnRefused(refuse(404, "not_found"));
      if (row.busy) throw new TurnRefused(refuse(409, "turn_in_progress"));
      await tx.$executeRaw`UPDATE conversations SET turn_started_at = now() WHERE id = ${conversationId}::uuid`;
    }

    if (request.trigger === "submit-message") {
      const inserted = await insertUserMessage(tx, conversationId, { ...request.message, role: "user" });
      if (!inserted) throw new TurnRefused(refuse(409, "duplicate_message"));
    } else {
      const latest = await tx.chatMessage.findFirst({
        where: { conversationId },
        orderBy: { seq: "desc" },
        select: { id: true, role: true, metadata: true },
      });
      const interrupted = (latest?.metadata as { interrupted?: boolean } | null)?.interrupted === true;
      if (!latest || latest.id !== request.regenerateMessageId || latest.role !== "ASSISTANT" || !interrupted) {
        throw new TurnRefused(refuse(409, "not_retryable"));
      }
    }
    return conversationId;
  });
}

async function closeTurn(conversationId: string) {
  await db.$executeRaw`UPDATE conversations SET turn_started_at = NULL WHERE id = ${conversationId}::uuid`;
}

// The model input for this turn: instructions plus the converted history.
async function buildModelInput(conversationId: string, request: TurnRequest, options: TurnOptions, tools: ReturnType<typeof createAssistantTools>) {
  const [rows, brief, refs, factSheet, conversation, assistantCount] = await Promise.all([
    db.chatMessage.findMany({ where: { conversationId }, orderBy: { seq: "desc" }, take: historyLimit + 1 }),
    loadBrief(conversationId),
    loadReferenceData(),
    options.factSheet === undefined ? liveFactSheet() : null,
    db.conversation.findUniqueOrThrow({ where: { id: conversationId }, select: { startListingId: true } }),
    db.chatMessage.count({ where: { conversationId, role: "ASSISTANT" } }),
  ]);

  // A retry drops the interrupted reply from what the model sees.
  const history = rows
    .reverse()
    .filter((row) => row.id !== request.regenerateMessageId)
    .map((row) => ({
      id: row.id,
      role: row.role.toLowerCase() as ChatMessageInput["role"],
      parts: row.parts as ChatMessageInput["parts"],
    }));

  let startingListing: Record<string, unknown> | null = null;
  if (conversation.startListingId && assistantCount < 2) {
    const details = await listingFacts(conversation.startListingId);
    if (details?.status === "PUBLISHED") startingListing = details.facts;
  }

  const instructions = buildInstructions({
    locale: request.locale,
    today: dhakaToday(),
    refs,
    factSheet: options.factSheet ?? factSheet?.body ?? null,
    brief: briefForModel(brief, refs),
    startingListing,
  });
  return { instructions, messages: await toModelHistory(history, tools) };
}

// `metadata.results` for Show more: the latest search in the reply, page 1 next.
function resultsMetadata(parts: UIMessage["parts"]) {
  const search = parts.findLast(
    (part) => part.type === "tool-searchListings" && "state" in part && part.state === "output-available",
  ) as { output: SearchListingsOutput } | undefined;
  return search ? { briefVersion: search.output.briefVersion, nextPage: 1, total: search.output.total } : undefined;
}

export async function runAssistantTurn(request: TurnRequest, options: TurnOptions = {}): Promise<TurnRefusal | TurnStarted> {
  const { user } = request;
  const isVisitor = user.role === "VISITOR";

  // Step 1: validate.
  if (request.trigger === "submit-message") {
    const text = textContent(request.message.parts).trim();
    if (text.length < 1 || text.length > maxMessageLength) return refuse(400, "invalid");
  } else if (!request.regenerateMessageId) {
    return refuse(400, "invalid");
  }

  let model: LanguageModel;
  try {
    model = options.model ?? chatModel();
  } catch (error) {
    if (error instanceof ModelNotConfiguredError) return refuse(503, "assistant_unavailable");
    throw error;
  }

  // Step 2: reserve a slot (visitors only).
  let used: number | null = null;
  if (isVisitor) {
    used = await reserveMessageSlot(user.id);
    if (used === null) return { ...refuse(429, "daily_limit"), resetsAt: limitResetsAt() };
  }
  const refund = () => (isVisitor ? refundMessageSlot(user.id) : Promise.resolve());

  // Steps 3 to 5.
  let conversationId: string;
  try {
    conversationId = await openTurn(request);
  } catch (error) {
    await refund();
    if (error instanceof TurnRefused) return error.refusal;
    throw error;
  }

  const shownListingIds = await loadShownListingIds(conversationId);
  const tools = createAssistantTools({ conversationId, shownListingIds });
  let input: Awaited<ReturnType<typeof buildModelInput>>;
  try {
    input = await buildModelInput(conversationId, request, options, tools);
  } catch (error) {
    await closeTurn(conversationId);
    await refund();
    throw error;
  }

  // Step 6: stream, with the timeout and the stop check (step 7).
  const controller = new AbortController();
  let abortedBy: "stop" | "timeout" | null = null;
  const timeout = setTimeout(() => {
    abortedBy ??= "timeout";
    controller.abort("timeout");
  }, options.timeoutMs ?? replyTimeoutMs);
  const stopCheck = setInterval(() => {
    db.$queryRaw<{ stop: boolean }[]>`
      SELECT coalesce(stop_requested_at > turn_started_at, false) AS stop FROM conversations WHERE id = ${conversationId}::uuid`
      .then(([row]) => {
        if (row?.stop && !controller.signal.aborted) {
          abortedBy ??= "stop";
          controller.abort("stopped");
        }
      })
      .catch((error: unknown) => reportError(error, { where: "assistant.stopCheck", conversationId }));
  }, stopPollMs);

  const usage = { inputTokens: 0, outputTokens: 0 };
  const providers = new Set<string>();
  let failed: unknown = null;

  const result = streamText({
    model,
    instructions: input.instructions,
    messages: input.messages,
    tools,
    stopWhen: isStepCount(maxSteps),
    maxOutputTokens: maxOutputTokensPerStep,
    toolCallConcurrency: 1,
    abortSignal: controller.signal,
    onStepEnd: (step) => {
      usage.inputTokens += step.usage.inputTokens ?? 0;
      usage.outputTokens += step.usage.outputTokens ?? 0;
      const provider = step.providerMetadata?.openrouter?.provider;
      if (typeof provider === "string") providers.add(provider);
    },
    onError: ({ error }) => {
      failed ??= error;
    },
  });

  const messageId = request.trigger === "regenerate-message" ? request.regenerateMessageId! : generateId();
  const remainingAfter = used === null ? null : Math.max(dailyMessageLimit - used, 0);

  let settle!: (value: TurnResult) => void;
  let fail!: (error: unknown) => void;
  const done = new Promise<TurnResult>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });

  // Steps 8 and 9: save on every outcome.
  const saveTurn = async (responseMessage: AssistantUIMessage, finishReason: string | undefined, completed: boolean) => {
    const outcome: TurnOutcome =
      abortedBy === "stop"
        ? "stopped"
        : abortedBy === "timeout" || failed !== null || !completed || finishReason === "length" || finishReason === "error"
          ? "interrupted"
          : "finished";

    const parts = responseMessage.parts.filter((part) => part.type !== "reasoning") as ChatMessageInput["parts"];
    const text = textContent(parts);
    const message: ChatMessageInput = { id: messageId, role: "assistant", parts };

    const ungrounded = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${conversationId}::uuid FOR UPDATE`;
      const hits = await checkGrounding(tx, text, shownListingIds);
      const results = resultsMetadata(responseMessage.parts);
      message.metadata = {
        locale: detectLocale(text, request.locale),
        usage,
        ...(outcome === "stopped" ? { stopped: true } : {}),
        ...(outcome === "interrupted" ? { interrupted: true } : {}),
        ...(hits.length > 0 ? { ungrounded: true } : {}),
        ...(results ? { results } : {}),
      };
      await saveServerMessage(tx, conversationId, message);
      await recordUsage(user.id, { messages: 0, ...usage }, tx);
      if (outcome === "interrupted" && isVisitor) await refundMessageSlot(user.id, tx);
      await tx.$executeRaw`UPDATE conversations SET turn_started_at = NULL WHERE id = ${conversationId}::uuid`;
      return hits;
    });

    if (ungrounded.length > 0) {
      reportEvent("assistant.ungrounded", { conversationId, messageId, codes: ungrounded });
    }
    if (failed !== null || abortedBy === "timeout") {
      reportError(failed ?? new Error("Assistant reply timed out"), { where: "assistant.turn", conversationId, messageId });
    }
    const remaining = remainingAfter === null ? null : outcome === "interrupted" ? remainingAfter + 1 : remainingAfter;
    return { outcome, message, ungrounded, usage, remaining, providers: [...providers] };
  };

  const stream = result.toUIMessageStream<AssistantUIMessage>({
    originalMessages: [],
    generateMessageId: () => messageId,
    sendReasoning: false,
    messageMetadata: ({ part }): AssistantStreamMetadata | undefined => {
      if (part.type === "start") return { conversationId };
      if (part.type === "finish" && remainingAfter !== null) return { remaining: remainingAfter };
      return undefined;
    },
    onError: (error) => {
      failed ??= error;
      return "The assistant couldn't finish this reply.";
    },
    onEnd: async ({ responseMessage, finishReason, outcome }) => {
      clearTimeout(timeout);
      clearInterval(stopCheck);
      try {
        settle(await saveTurn(responseMessage, finishReason, outcome.status === "completed"));
      } catch (error) {
        reportError(error, { where: "assistant.saveTurn", conversationId, messageId });
        await closeTurn(conversationId).catch(() => undefined);
        fail(error);
      }
    },
  });

  return { ok: true, conversationId, messageId, stream, done };
}
