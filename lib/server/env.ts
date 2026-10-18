import "server-only";
import { z } from "zod";

// Server only variables (spec 0001: read env only through these modules).
// Parsed on first use and once at server start (see `instrumentation.ts`), so a
// missing value fails loudly at boot instead of mid request.
const serverSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cached ??= serverSchema.parse(process.env);
  return cached;
}
