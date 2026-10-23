import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { db } from "@/lib/server/db";

// Daily AI usage per user (spec 0002). The day is the Asia/Dhaka calendar day,
// computed in SQL. The chat's daily limit lives here too (spec 0006, *Daily
// limit and usage*).

type Client = typeof db | Prisma.TransactionClient;

export type Usage = { inputTokens?: number; outputTokens?: number };

const tokens = (value: number | undefined) => (Number.isFinite(value) && value! > 0 ? Math.round(value!) : 0);

// Adds tokens, plus `messages` to the message count. The chat always passes
// `messages: 0`: its slot was reserved before the model call (spec 0006).
// Missing usage counts as 0.
export async function recordUsage(userId: string, usage: Usage & { messages: 0 | 1 }, client: Client = db) {
  const input = tokens(usage.inputTokens);
  const output = tokens(usage.outputTokens);
  const [row] = await client.$queryRaw<
    { day: Date; message_count: number; input_tokens: number; output_tokens: number }[]
  >`
    INSERT INTO ai_usage_daily (user_id, day, message_count, input_tokens, output_tokens)
    VALUES (${userId}::uuid, (now() AT TIME ZONE 'Asia/Dhaka')::date, ${usage.messages}, ${input}, ${output})
    ON CONFLICT (user_id, day) DO UPDATE SET
      message_count = ai_usage_daily.message_count + excluded.message_count,
      input_tokens = ai_usage_daily.input_tokens + excluded.input_tokens,
      output_tokens = ai_usage_daily.output_tokens + excluded.output_tokens
    RETURNING day, message_count, input_tokens, output_tokens`;
  return {
    day: row.day.toISOString().slice(0, 10),
    messageCount: row.message_count,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
  };
}

// ---------------------------------------------------------------------------
// The visitor's daily message limit (spec 0006, AC-9).

export const dailyMessageLimit = 40;

// A reserved slot: the Dhaka day it counts against (so a refund after midnight
// returns it to the right day) and today's count with it.
export type ChatSlot = { day: string; used: number };

// Reserves one message atomically before the model is called: parallel sends
// can't pass the limit. Null at the limit; nothing else is written then.
export async function reserveChatSlot(userId: string): Promise<ChatSlot | null> {
  const rows = await db.$queryRaw<{ day: Date; message_count: number }[]>`
    INSERT INTO ai_usage_daily (user_id, day, message_count)
    VALUES (${userId}::uuid, (now() AT TIME ZONE 'Asia/Dhaka')::date, 1)
    ON CONFLICT (user_id, day) DO UPDATE SET message_count = ai_usage_daily.message_count + 1
      WHERE ai_usage_daily.message_count < ${dailyMessageLimit}
    RETURNING day, message_count`;
  const row = rows[0];
  return row ? { day: row.day.toISOString().slice(0, 10), used: row.message_count } : null;
}

// Messages a visitor has left today, for the composer on page load (AC-9).
export async function chatMessagesLeft(userId: string): Promise<number> {
  const [row] = await db.$queryRaw<{ message_count: number }[]>`
    SELECT message_count FROM ai_usage_daily
    WHERE user_id = ${userId}::uuid AND day = (now() AT TIME ZONE 'Asia/Dhaka')::date`;
  return Math.max(dailyMessageLimit - (row?.message_count ?? 0), 0);
}

// Returns a slot whose reply failed, never below 0.
export async function refundChatSlot(userId: string, slot: ChatSlot, client: Client = db) {
  await client.$executeRaw`
    UPDATE ai_usage_daily SET message_count = greatest(message_count - 1, 0)
    WHERE user_id = ${userId}::uuid AND day = ${slot.day}::date`;
}

// The next midnight in Asia/Dhaka (UTC+6, no daylight saving), as an ISO time.
export function chatLimitResetsAt(now = new Date()): string {
  const dhakaOffsetMs = 6 * 60 * 60 * 1000;
  const dhakaNow = new Date(now.getTime() + dhakaOffsetMs);
  const nextMidnightDhaka = Date.UTC(dhakaNow.getUTCFullYear(), dhakaNow.getUTCMonth(), dhakaNow.getUTCDate() + 1);
  return new Date(nextMidnightDhaka - dhakaOffsetMs).toISOString();
}
