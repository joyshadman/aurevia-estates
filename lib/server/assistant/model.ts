import "server-only";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { aiEnv } from "@/lib/server/env";

// The chat model (spec 0001 routing, spec 0006 settings). Swapping the model is
// a change to `AI_CHAT_MODEL` followed by `npm run eval:assistant`.

// The OpenRouter upstream providers that passed the eval, in order (spec 0006,
// AC-1): docs/evals/assistant-2026-10-23.md, 18 of 20 on DekaLLM and Venice.
// Repin after any rerun that passes on a different upstream.
export const pinnedProviders: string[] = ["dekallm", "venice"];

export function chatModel() {
  const { OPENROUTER_API_KEY, AI_CHAT_MODEL } = aiEnv();
  const openrouter = createOpenRouter({ apiKey: OPENROUTER_API_KEY });
  return openrouter.chat(AI_CHAT_MODEL, {
    // No `parallelToolCalls`: no upstream of gpt-oss-120b supports it, and with
    // `require_parameters` it ruled out every provider. Tools still run one at a
    // time: `toolCallConcurrency: 1` in `turn.ts` (spec 0006, *The chat turn*).
    // Low effort, and reasoning is never returned, stored, or sent back.
    reasoning: { effort: "low", exclude: true },
    usage: { include: true },
    provider: {
      require_parameters: true,
      ...(pinnedProviders.length > 0 ? { order: pinnedProviders, allow_fallbacks: false } : {}),
    },
  });
}

export function chatModelId(): string {
  return aiEnv().AI_CHAT_MODEL;
}
