import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { db } from "@/lib/server/db";

// Daily AI usage per user (spec 0002). The day is the Asia/Dhaka calendar day,
// computed in SQL.

export type Usage = { messages?: 0 | 1; inputTokens?: number; outputTokens?: number };

type Client = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">;

const tokens = (value: number | undefined) => (Number.isFinite(value) && value! > 0 ? Math.round(value!) : 0);

// Adds tokens, and counts one message unless `messages: 0`. The chat (spec 0006)
// reserves its slot up front, so it always passes `messages: 0`. Missing usage
// counts as 0.
export async function recordUsage(userId: string, usage: Usage = {}, client: Client = db) {
  const messages = usage.messages ?? 1;
  const input = tokens(usage.inputTokens);
  const output = tokens(usage.outputTokens);
  const [row] = await client.$queryRaw<
    { day: Date; message_count: number; input_tokens: number; output_tokens: number }[]
  >`
    INSERT INTO ai_usage_daily (user_id, day, message_count, input_tokens, output_tokens)
    VALUES (${userId}::uuid, (now() AT TIME ZONE 'Asia/Dhaka')::date, ${messages}, ${input}, ${output})
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
// The visitor daily message limit (spec 0006, AC-9).

export const dailyMessageLimit = 40;

// Atomically takes one slot for today. Returns the new count, or null when the
// limit is reached (nothing is written then). Parallel calls can't exceed it.
export async function reserveMessageSlot(userId: string, client: Client = db): Promise<number | null> {
  const rows = await client.$queryRaw<{ message_count: number }[]>`
    INSERT INTO ai_usage_daily (user_id, day, message_count)
    VALUES (${userId}::uuid, (now() AT TIME ZONE 'Asia/Dhaka')::date, 1)
    ON CONFLICT (user_id, day) DO UPDATE SET message_count = ai_usage_daily.message_count + 1
    WHERE ai_usage_daily.message_count < ${dailyMessageLimit}
    RETURNING message_count`;
  return rows[0]?.message_count ?? null;
}

// Returns a reserved slot (a failed reply, or a refused turn). Never below 0.
export async function refundMessageSlot(userId: string, client: Client = db) {
  await client.$executeRaw`
    UPDATE ai_usage_daily SET message_count = greatest(message_count - 1, 0)
    WHERE user_id = ${userId}::uuid AND day = (now() AT TIME ZONE 'Asia/Dhaka')::date`;
}

export async function remainingMessages(userId: string, client: Client = db): Promise<number> {
  const rows = await client.$queryRaw<{ message_count: number }[]>`
    SELECT message_count FROM ai_usage_daily
    WHERE user_id = ${userId}::uuid AND day = (now() AT TIME ZONE 'Asia/Dhaka')::date`;
  return Math.max(dailyMessageLimit - (rows[0]?.message_count ?? 0), 0);
}

// The next midnight in Asia/Dhaka (UTC+6, no daylight saving), as an ISO time.
export function limitResetsAt(now = new Date()): string {
  const dhakaOffsetMs = 6 * 60 * 60 * 1000;
  const dhaka = new Date(now.getTime() + dhakaOffsetMs);
  const nextMidnightUtc = Date.UTC(dhaka.getUTCFullYear(), dhaka.getUTCMonth(), dhaka.getUTCDate() + 1);
  return new Date(nextMidnightUtc - dhakaOffsetMs).toISOString();
}
