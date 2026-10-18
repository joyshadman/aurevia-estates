import "server-only";
import { db } from "@/lib/server/db";

// Daily AI usage per user (spec 0002). The day is the Asia/Dhaka calendar day,
// computed in SQL. Feature 7 reads it for the daily cap.

export type Usage = { inputTokens?: number; outputTokens?: number };

const tokens = (value: number | undefined) => (Number.isFinite(value) && value! > 0 ? Math.round(value!) : 0);

// Counts one message plus its tokens. Missing usage counts as 0.
export async function recordUsage(userId: string, usage: Usage = {}) {
  const input = tokens(usage.inputTokens);
  const output = tokens(usage.outputTokens);
  const [row] = await db.$queryRaw<
    { day: Date; message_count: number; input_tokens: number; output_tokens: number }[]
  >`
    INSERT INTO ai_usage_daily (user_id, day, message_count, input_tokens, output_tokens)
    VALUES (${userId}::uuid, (now() AT TIME ZONE 'Asia/Dhaka')::date, 1, ${input}, ${output})
    ON CONFLICT (user_id, day) DO UPDATE SET
      message_count = ai_usage_daily.message_count + 1,
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
