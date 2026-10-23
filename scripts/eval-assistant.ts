// `npm run eval:assistant` (spec 0006, AC-1): runs the 20 scripted conversations
// against `AI_CHAT_MODEL` and the seeded sample listings, through the same
// `runAssistantTurn` the chat route uses, and writes docs/evals/assistant-<date>.md.
// Pass: at least 18 of 20 and zero grounding failures. Exit code 1 on a fail.
//
// Runs outside Next.js with the `react-server` condition, so `server-only`
// imports resolve to their empty build. Needs DATABASE_URL,
// BETTER_AUTH_SECRET, and OPENROUTER_API_KEY (from .env.local or .env).
import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { cases, factSheetFixture, type EvalCase } from "@/evals/assistant/cases";
import { banglaScriptShare } from "@/lib/domain/bangla";
import type { BriefUpdate } from "@/lib/server/assistant/brief";
import type { AssistantUIMessage } from "@/lib/server/assistant/history";
import { chatModelId } from "@/lib/server/assistant/model";
import type { MatchesOutput } from "@/lib/server/assistant/tools";
import { runAssistantTurn, type SavedTurn } from "@/lib/server/assistant/turn";
import { textContent, type ChatMessageInput } from "@/lib/server/chat-store";
import { db } from "@/lib/server/db";
import { uuidv7 } from "@/lib/server/uuid";

// Env modules parse on first use, so loading the files here is early enough.
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

const passMark = 18;
const sampleRefs = Array.from({ length: 10 }, (_, i) => `AUR-${1001 + i}`);

// A fixed test visitor. Like the sample agent, it has no auth user and cannot sign in.
const evalUser = { id: "0199f000-0000-7000-8000-00000000e7a1", role: "VISITOR" as const };

type ToolCall = { name: string; input: unknown; output: unknown };
type Check = { name: string; passed: boolean; detail?: string };
type CaseResult = {
  testCase: EvalCase;
  checks: Check[];
  passed: boolean;
  groundingFailure: boolean;
  reply: string;
  tools: ToolCall[];
  turns: SavedTurn[];
  error?: string;
};

function toolCalls(message: AssistantUIMessage): ToolCall[] {
  return message.parts.flatMap((part) => {
    if (!part.type.startsWith("tool-")) return [];
    const tool = part as { type: string; input?: unknown; output?: unknown };
    return [{ name: part.type.slice("tool-".length), input: tool.input, output: tool.output }];
  });
}

async function runTurns(testCase: EvalCase) {
  const turns: SavedTurn[] = [];
  let conversationId: string | undefined;
  for (const text of testCase.turns) {
    const turn = await runAssistantTurn({
      user: evalUser,
      conversationId,
      message: { id: uuidv7(), role: "user", parts: [{ type: "text", text }] },
      locale: testCase.locale,
      factSheetBody: factSheetFixture,
    });
    conversationId = turn.conversationId;
    // Drain the stream as the route's SSE consumer would; the save runs at its end.
    const reader = turn.stream.getReader();
    while (!(await reader.read()).done);
    turns.push(await turn.saved);
  }
  return turns;
}

function evaluate(testCase: EvalCase, turns: SavedTurn[]): Omit<CaseResult, "testCase" | "turns"> {
  const last = turns.at(-1)!;
  const reply = textContent(last.message.parts as ChatMessageInput["parts"]).trim();
  const tools = turns.flatMap((turn) => toolCalls(turn.message));
  const checks: Check[] = [];

  for (const expected of testCase.expectTools) {
    const calls = tools.filter((call) => call.name === expected.name);
    const met = calls.some((call) => {
      if (expected.name === "updateBrief") return expected.input(call.input as BriefUpdate);
      if (expected.name === "searchListings" && expected.output) return expected.output(call.output as MatchesOutput);
      return true;
    });
    const detail = met ? undefined : calls.length === 0 ? "not called" : `inputs: ${JSON.stringify(calls.map((call) => call.input))}`;
    checks.push({ name: `${expected.name}: ${expected.why}`, passed: met, detail });
  }
  for (const name of testCase.forbidTools ?? []) {
    checks.push({ name: `does not call ${name}`, passed: !tools.some((call) => call.name === name) });
  }

  const share = banglaScriptShare(reply);
  const languageOk = testCase.expectLanguage === "bn" ? share > 0.5 : share <= 0.5;
  checks.push({ name: `replies in ${testCase.expectLanguage === "bn" ? "Bangla" : "English"}`, passed: languageOk, detail: `Bangla share ${share.toFixed(2)}` });
  checks.push({ name: "reply is not empty", passed: reply.length > 0 });
  checks.push({ name: "no reply was interrupted", passed: turns.every((turn) => turn.outcome === "finished") });

  for (const { why, pattern } of testCase.textMatches ?? []) checks.push({ name: why, passed: pattern.test(reply) });
  for (const { why, pattern } of testCase.textAvoids ?? []) checks.push({ name: why, passed: !pattern.test(reply) });

  const ungrounded = [...new Set(turns.flatMap((turn) => turn.ungroundedCodes))];
  checks.push({ name: "grounded (names only shown listings)", passed: ungrounded.length === 0, detail: ungrounded.join(", ") || undefined });

  return { checks, passed: checks.every((check) => check.passed), groundingFailure: ungrounded.length > 0, reply, tools };
}

function report(results: CaseResult[], model: string, date: string, passed: boolean) {
  const providers = [...new Set(results.flatMap((result) => result.turns.flatMap((turn) => turn.providers)))];
  const tokens = results
    .flatMap((result) => result.turns)
    .reduce((sum, turn) => ({ input: sum.input + turn.usage.inputTokens, output: sum.output + turn.usage.outputTokens }), {
      input: 0,
      output: 0,
    });
  const passCount = results.filter((result) => result.passed).length;
  const groundingFailures = results.filter((result) => result.groundingFailure).length;
  const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

  const lines = [
    `# Assistant eval · ${date}`,
    "",
    `_Spec 0006, AC-1. Written by \`npm run eval:assistant\`._`,
    "",
    `- **Result**: ${passed ? "PASS" : "FAIL"} (${passCount} of ${results.length} passed, ${groundingFailures} grounding failures; pass needs ${passMark} and 0)`,
    `- **Model**: \`${model}\``,
    `- **OpenRouter providers used**: ${providers.length > 0 ? providers.map((p) => `\`${p}\``).join(", ") : "not reported"}`,
    `- **Tokens**: ${tokens.input.toLocaleString("en-US")} input, ${tokens.output.toLocaleString("en-US")} output`,
    "",
    "| Case | Group | Result | Failed checks |",
    "|---|---|---|---|",
    ...results.map((result) => {
      const failed = result.error ? `error: ${result.error}` : result.checks.filter((c) => !c.passed).map((c) => c.name + (c.detail ? ` (${c.detail})` : "")).join("; ");
      return `| ${result.testCase.id} | ${result.testCase.group} | ${result.passed ? "pass" : "FAIL"} | ${cell(failed) || "none"} |`;
    }),
    "",
    "## Replies",
    "",
    ...results.flatMap((result) => [
      `### ${result.testCase.id}`,
      "",
      ...result.testCase.turns.map((turn) => `> ${turn}`),
      "",
      `Tools: ${result.tools.map((call) => `\`${call.name}\` ${call.name === "updateBrief" ? JSON.stringify(call.input) : ""}`).join(", ") || "none"}`,
      "",
      result.reply || "_(empty)_",
      "",
    ]),
  ];
  return lines.join("\n");
}

async function main() {
  const published = await db.listing.count({ where: { refCode: { in: sampleRefs }, status: "PUBLISHED" } });
  if (published < sampleRefs.length) {
    throw new Error(`Found ${published} of ${sampleRefs.length} sample listings. Run \`npm run db:seed -- --sample\` first.`);
  }
  await db.profile.upsert({
    where: { id: evalUser.id },
    create: { ...evalUser, email: "eval.assistant@aurevia.example", emailVerified: true, fullName: "Assistant eval" },
    update: {},
  });
  // The test visitor's daily limit (AC-9) is not what the eval measures: start
  // each run with today's count at zero, so repeated runs never hit it.
  await db.aiUsageDaily.deleteMany({ where: { userId: evalUser.id } });

  // `-- --only <id>[,<id>]` runs just those cases, for debugging. It never
  // writes the report and never counts as the gate.
  const onlyIndex = process.argv.indexOf("--only");
  const only = onlyIndex >= 0 ? new Set(process.argv[onlyIndex + 1]?.split(",") ?? []) : null;
  const selected = only ? cases.filter((testCase) => only.has(testCase.id)) : cases;
  if (only && selected.length === 0) throw new Error(`No case matches --only ${[...only].join(",")}`);

  const model = chatModelId();
  const date = new Date().toISOString().slice(0, 10);
  const results: CaseResult[] = [];
  for (const testCase of selected) {
    process.stdout.write(`${testCase.id} ... `);
    let turns: SavedTurn[] = [];
    try {
      turns = await runTurns(testCase);
      results.push({ testCase, turns, ...evaluate(testCase, turns) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ testCase, turns, checks: [], passed: false, groundingFailure: false, reply: "", tools: [], error: message });
    } finally {
      // Conversations, messages, briefs, and recommendations go with the cascade.
      const ids = [...new Set(turns.map((turn) => turn.conversationId))];
      await db.conversation.deleteMany({ where: { userId: evalUser.id, id: { in: ids } } });
    }
    console.log(results.at(-1)!.passed ? "pass" : "FAIL");
  }
  await db.conversation.deleteMany({ where: { userId: evalUser.id } });

  const passCount = results.filter((result) => result.passed).length;
  const groundingFailures = results.filter((result) => result.groundingFailure).length;
  const passed = passCount >= passMark && groundingFailures === 0;

  if (only) {
    for (const result of results) {
      const failed = result.error ? [`error: ${result.error}`] : result.checks.filter((c) => !c.passed).map((c) => c.name + (c.detail ? ` (${c.detail})` : ""));
      console.log(`\n${result.testCase.id}: ${result.passed ? "pass" : "FAIL"}`);
      console.log(`  outcomes: ${result.turns.map((turn) => turn.outcome).join(", ") || "none"}; providers: ${result.turns.flatMap((t) => t.providers).join(", ") || "none"}`);
      console.log(`  tools: ${result.tools.map((call) => call.name).join(", ") || "none"}`);
      for (const line of failed) console.log(`  failed: ${line}`);
      console.log(`  reply: ${result.reply.slice(0, 400) || "(empty)"}`);
    }
    console.log("\n--only run: no report written, not the gate.");
    return passCount === results.length;
  }

  await mkdir("docs/evals", { recursive: true });
  const file = `docs/evals/assistant-${date}.md`;
  await writeFile(file, report(results, model, date, passed));
  console.log(`\n${passed ? "PASS" : "FAIL"}: ${passCount}/${results.length}, ${groundingFailures} grounding failures. Report: ${file}`);
  return passed;
}

main()
  .then((passed) => process.exit(passed ? 0 : 1))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
