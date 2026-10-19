import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import type { TurnRefusal, TurnResult, TurnStarted } from "@/lib/server/assistant/turn";

// A scripted language model for assistant tests (spec 0006). Each model call
// (one step) plays the next entry; the last one repeats.

export type ScriptedStep = {
  text?: string;
  tools?: { name: string; input: unknown }[];
  finish?: "stop" | "length" | "tool-calls";
  // Ends the step with a provider error instead of a finish.
  error?: string;
  // Delay between chunks, for stop and timeout tests.
  delayMs?: number;
  // Number of text chunks to split `text` into (with `delayMs`, a slow reply).
  chunks?: number;
};

const usage = (input: number, output: number) => ({
  inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: output, text: output, reasoning: undefined },
});

export const tokensPerStep = { input: 100, output: 20 };

export function scriptedModel(steps: ScriptedStep[]) {
  let call = 0;
  const prompts: unknown[] = [];

  const model = new MockLanguageModelV4({
    doStream: async (options) => {
      prompts.push(options.prompt);
      const step = steps[Math.min(call, steps.length - 1)];
      call++;

      const chunks: unknown[] = [{ type: "stream-start", warnings: [] }];
      if (step.text !== undefined) {
        const pieces = step.chunks ?? 1;
        const size = Math.ceil(step.text.length / pieces) || 1;
        chunks.push({ type: "text-start", id: "t" });
        for (let i = 0; i < step.text.length; i += size) {
          chunks.push({ type: "text-delta", id: "t", delta: step.text.slice(i, i + size) });
        }
        chunks.push({ type: "text-end", id: "t" });
      }
      step.tools?.forEach((t, i) => {
        chunks.push({ type: "tool-call", toolCallId: `call-${call}-${i}`, toolName: t.name, input: JSON.stringify(t.input) });
      });
      if (step.error) {
        chunks.push({ type: "error", error: new Error(step.error) });
      } else {
        chunks.push({
          type: "finish",
          finishReason: { unified: step.finish ?? (step.tools ? "tool-calls" : "stop"), raw: undefined },
          usage: usage(tokensPerStep.input, tokensPerStep.output),
        });
      }
      return {
        stream: simulateReadableStream({ chunks: chunks as never[], chunkDelayInMs: step.delayMs ?? null }),
      };
    },
  });

  return { model, prompts, calls: () => call };
}

// Reads the reply stream to the end (as the route does) and waits for the save.
export async function finishTurn(started: TurnRefusal | TurnStarted): Promise<TurnResult & { conversationId: string }> {
  if (!started.ok) throw new Error(`Turn refused: ${started.status} ${started.reason}`);
  const reader = started.stream.getReader();
  while (!(await reader.read()).done) {
    // Drain.
  }
  return { ...(await started.done), conversationId: started.conversationId };
}
