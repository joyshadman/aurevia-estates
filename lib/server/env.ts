import "server-only";
import { z } from "zod";

// Server only variables (spec 0001: read env only through these modules).
// Parsed on first use and once at server start (see `instrumentation.ts`), so a
// missing value fails loudly at boot instead of mid request.
const serverSchema = z.object({
  DATABASE_URL: z.string().min(1),
  // Signs session cookies and encrypts 2FA secrets (spec 0008). One per
  // environment: rotating it signs everyone out and breaks stored 2FA secrets.
  BETTER_AUTH_SECRET: z.string().min(32),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cached ??= serverSchema.parse(process.env);
  return cached;
}

// AI variables (spec 0001, first used by spec 0006). Parsed on the first AI call
// rather than at boot, so pages that never call the model still start without them.
const aiSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(1),
  AI_CHAT_MODEL: z.string().min(1).default("openai/gpt-oss-120b"),
});

export type AiEnv = z.infer<typeof aiSchema>;

let aiCached: AiEnv | undefined;

export function aiEnv(): AiEnv {
  aiCached ??= aiSchema.parse(process.env);
  return aiCached;
}

// Better Auth's emails and Google (spec 0008, *Configuration required*). Parsed
// when the auth instance is first built. Google is optional: preview
// deployments without a fixed domain get email and password sign in only.
const blankAsMissing = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined);

const authSchema = z.object({
  RESEND_API_KEY: z.string().min(1),
  AUTH_EMAIL_FROM: z.string().min(1),
  GOOGLE_CLIENT_ID: blankAsMissing,
  GOOGLE_CLIENT_SECRET: blankAsMissing,
});

export type AuthEnv = z.infer<typeof authSchema>;

let authCached: AuthEnv | undefined;

export function authEnv(): AuthEnv {
  authCached ??= authSchema.parse(process.env);
  return authCached;
}

// hCaptcha secret (spec 0008, AC-4): every public auth action checks the token
// once with it before calling Better Auth.
const captchaSchema = z.object({ HCAPTCHA_SECRET: z.string().min(1) });

let captchaCached: z.infer<typeof captchaSchema> | undefined;

export function captchaEnv() {
  captchaCached ??= captchaSchema.parse(process.env);
  return captchaCached;
}
