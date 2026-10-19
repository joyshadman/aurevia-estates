import "server-only";
import { z } from "zod";

// Server only variables (spec 0001: read env only through these modules).
// Parsed on first use and once at server start (see `instrumentation.ts`), so a
// missing value fails loudly at boot instead of mid request.
const serverSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // The assistant (spec 0006). Optional so the app boots without it; the chat
  // refuses to start a reply until the key is set.
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  AI_CHAT_MODEL: z.string().min(1).default("openai/gpt-oss-120b"),
  // Upstream providers to pin, comma separated, in order (from the eval).
  OPENROUTER_PROVIDER_ORDER: z
    .string()
    .optional()
    .transform((value) => value?.split(",").map((p) => p.trim()).filter(Boolean) ?? []),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cached ??= serverSchema.parse(process.env);
  return cached;
}
