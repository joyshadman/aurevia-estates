// The assistant eval gate (spec 0006, AC-1): `npm run eval:assistant`.
// Runs the 20 cases in `evals/assistant/cases.ts` through `runAssistantTurn`
// against `AI_CHAT_MODEL`, the database in `.env.local` (seeded with
// `npx prisma db seed -- --sample`), a throwaway visitor, and a filled fact
// sheet. Writes `docs/evals/assistant-<date>.md` and exits non zero on a fail.
//
// Runs as `tsx --conditions react-server`, so `server-only` imports resolve.
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

// The imports below are hoisted above these calls; that's fine, because server
// modules read the environment on first use, not at import.
import { mkdirSync, writeFileSync } from "node:fs";
import { cases, evalFactSheet, type EvalCase, type ToolExpectation } from "../evals/assistant/cases";
import { banglaShare, type ChatLocale } from "../lib/domain/chat-text";
import { chatModelId } from "../lib/server/assistant/model";
import type { SearchListingsOutput } from "../lib/server/assistant/tools";
import { runAssistantTurn, type TurnResult } from "../lib/server/assistant/turn";
import { textContent } from "../lib/server/chat-store";
import { db } from "../lib/server/db";
import { serverEnv } from "../lib/server/env";
import { uuidv7 } from "../lib/server/uuid";

const passMark = 18;

type ToolPart = { type: string; state?: string; input?: Record<string, unknown>; output?: unknown };

type CaseReport = {
  id: string;
  group: EvalCase["group"];
  passed: boolean;
  failures: string[];
  groundingFailures: number;
  reply: string;
  tokens: { input: number; output: number };
  providers: string[];
};

function toolParts(result: TurnResult): ToolPart[] {
  return (result.message.parts as ToolPart[]).filter((part) => part.type.startsWith("tool-"));
}

function replyLanguage(text: string): ChatLocale | null {
  const share = banglaShare(text);
  return share === null ? null : share > 0.5 ? "bn" : "en";
}

function fieldMismatches(merged: Record<string, unknown>, expected: Record<string, unknown>): string[] {
  const problems: string[] = [];
  for (const [key, want] of Object.entries(expected)) {
    const got = merged[key];
    if (Array.isArray(want)) {
      const list = Array.isArray(got) ? got.map(String) : [];
      const missing = want.filter((value) => !list.includes(String(value)));
      if (missing.length > 0) problems.push(`updateBrief.${key} lacks ${missing.join(", ")} (got ${JSON.stringify(got)})`);
    } else if (got !== want) {
      problems.push(`updateBrief.${key} is ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
    }
  }
  return problems;
}

async function runCase(evalCase: EvalCase): Promise<CaseReport> {
  const id = uuidv7();
  // A fresh visitor per case keeps the daily limit and the history independent.
  await db.profile.create({ data: { id, role: "VISITOR", email: `eval+${evalCase.id}.${Date.now()}@aurevia.test` } });
  const user = { id, email: null, role: "VISITOR" as const };

  const failures: string[] = [];
  const results: TurnResult[] = [];
  let conversationId: string | undefined;

  try {
    for (const text of evalCase.turns) {
      const started = await runAssistantTurn(
        {
          user,
          conversationId,
          message: { id: uuidv7(), role: "user", parts: [{ type: "text", text }] },
          locale: evalCase.locale,
          trigger: "submit-message",
        },
        { factSheet: evalFactSheet },
      );
      if (!started.ok) throw new Error(`turn refused: ${started.status} ${started.reason}`);
      conversationId = started.conversationId;
      const reader = started.stream.getReader();
      while (!(await reader.read()).done) {
        // Drain the stream so the reply finishes and saves.
      }
      results.push(await started.done);
    }
  } catch (error) {
    failures.push(`error: ${error instanceof Error ? error.message : String(error)}`);
  }

  const last = results.at(-1);
  const reply = last ? textContent(last.message.parts).trim() : "";
  const parts = results.flatMap(toolParts);
  const called = new Set(parts.map((part) => part.type.slice("tool-".length)));

  for (const result of results) {
    if (result.outcome !== "finished") failures.push(`a reply ended ${result.outcome}`);
  }
  if (!reply) failures.push("the final reply has no text");

  const language = replyLanguage(reply);
  if (reply && language !== evalCase.replyIn) failures.push(`reply language ${language}, expected ${evalCase.replyIn}`);

  const merged = Object.assign(
    {},
    ...parts.filter((p) => p.type === "tool-updateBrief" && p.input).map((p) => p.input as Record<string, unknown>),
  );
  for (const expectation of evalCase.tools ?? ([] as ToolExpectation[])) {
    if (!called.has(expectation.name)) failures.push(`${expectation.name} was not called`);
    else if (expectation.fields) failures.push(...fieldMismatches(merged, expectation.fields));
  }
  for (const name of evalCase.noTools ?? []) {
    if (called.has(name)) failures.push(`${name} must not be called`);
  }

  if (evalCase.closeMatchesOnly) {
    const searches = parts.filter((p) => p.type === "tool-searchListings" && p.state === "output-available");
    const output = searches.at(-1)?.output as SearchListingsOutput | undefined;
    if (!output) failures.push("no search results to check");
    else if (output.exactCount !== 0 || output.cards.length === 0) {
      failures.push(`expected only close matches, got ${output.exactCount} exact and ${output.cards.length} shown`);
    }
  }
  if (evalCase.textMatches && !evalCase.textMatches.test(reply)) failures.push(`reply does not match ${evalCase.textMatches}`);
  if (evalCase.textNotMatches && evalCase.textNotMatches.test(reply)) failures.push(`reply matches ${evalCase.textNotMatches}`);
  if (evalCase.textMaxLength && reply.length > evalCase.textMaxLength) {
    failures.push(`reply is ${reply.length} characters, at most ${evalCase.textMaxLength}`);
  }

  const groundingFailures = results.filter((r) => r.ungrounded.length > 0).length;
  if (groundingFailures > 0) {
    failures.push(`ungrounded codes: ${results.flatMap((r) => r.ungrounded).join(", ")}`);
  }

  await db.profile.delete({ where: { id } });

  return {
    id: evalCase.id,
    group: evalCase.group,
    passed: failures.length === 0,
    failures,
    groundingFailures,
    reply,
    tokens: {
      input: results.reduce((sum, r) => sum + r.usage.inputTokens, 0),
      output: results.reduce((sum, r) => sum + r.usage.outputTokens, 0),
    },
    providers: [...new Set(results.flatMap((r) => r.providers))],
  };
}

function report(model: string, reports: CaseReport[], date: string) {
  const passed = reports.filter((r) => r.passed).length;
  const grounding = reports.reduce((sum, r) => sum + r.groundingFailures, 0);
  const gate = passed >= passMark && grounding === 0;
  const providers = [...new Set(reports.flatMap((r) => r.providers))];
  const tokens = reports.reduce((sum, r) => ({ input: sum.input + r.tokens.input, output: sum.output + r.tokens.output }), {
    input: 0,
    output: 0,
  });

  const rows = reports.map((r) => {
    const detail = r.passed ? "" : r.failures.join("; ").replace(/\|/g, "\\|");
    return `| ${r.id} | ${r.group} | ${r.passed ? "pass" : "fail"} | ${detail} |`;
  });
  const replies = reports.map((r) => `### ${r.id}\n\n${r.reply ? r.reply.split("\n").map((l) => `> ${l}`).join("\n") : "_(no reply)_"}`);

  return `# Assistant eval · ${date}

- Model: \`${model}\`
- OpenRouter provider(s): ${providers.length > 0 ? providers.map((p) => `\`${p}\``).join(", ") : "not reported"}
- Result: **${passed} of ${reports.length} passed**, ${grounding} grounding failure(s): **${gate ? "PASS" : "FAIL"}** (needs ${passMark} and zero grounding failures)
- Tokens: ${tokens.input} input, ${tokens.output} output

| Case | Group | Result | Why it failed |
|---|---|---|---|
${rows.join("\n")}

## Final replies

${replies.join("\n\n")}
`;
}

async function main() {
  if (!serverEnv().OPENROUTER_API_KEY) throw new Error("Set OPENROUTER_API_KEY in .env.local to run the eval.");
  const model = chatModelId();
  const sample = await db.listing.count({ where: { status: "PUBLISHED", refCode: { in: ["AUR-1001", "AUR-1010"] } } });
  if (sample < 2) throw new Error("Seed the sample listings first: npx prisma db seed -- --sample");

  console.log(`Running ${cases.length} cases against ${model}...`);
  const reports = [];
  for (const evalCase of cases) {
    const result = await runCase(evalCase);
    console.log(`${result.passed ? "pass" : "FAIL"}  ${result.id}${result.passed ? "" : `  ${result.failures.join("; ")}`}`);
    reports.push(result);
  }

  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());
  mkdirSync("docs/evals", { recursive: true });
  const path = `docs/evals/assistant-${date}.md`;
  writeFileSync(path, report(model, reports, date));

  const passed = reports.filter((r) => r.passed).length;
  const grounding = reports.reduce((sum, r) => sum + r.groundingFailures, 0);
  console.log(`\n${passed}/${reports.length} passed, ${grounding} grounding failure(s). Report: ${path}`);
  if (passed < passMark || grounding > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
