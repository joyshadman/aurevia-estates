import "server-only";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { serverEnv } from "@/lib/server/env";

// The chat model through OpenRouter (spec 0001): only upstreams that support
// every request parameter (tool calls), no silent fallback, the pinned order
// from the eval, one tool call at a time, low reasoning kept off the client.

export class ModelNotConfiguredError extends Error {
  constructor() {
    super("OPENROUTER_API_KEY is not set, so the assistant can't reply.");
    this.name = "ModelNotConfiguredError";
  }
}

export function chatModelId(): string {
  return serverEnv().AI_CHAT_MODEL;
}

export function chatModel(): LanguageModel {
  const env = serverEnv();
  if (!env.OPENROUTER_API_KEY) throw new ModelNotConfiguredError();
  const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
  return openrouter.chat(env.AI_CHAT_MODEL, {
    parallelToolCalls: false,
    reasoning: { effort: "low", exclude: true },
    usage: { include: true },
    provider: {
      require_parameters: true,
      allow_fallbacks: false,
      ...(env.OPENROUTER_PROVIDER_ORDER.length > 0 ? { order: env.OPENROUTER_PROVIDER_ORDER } : {}),
    },
  });
}
