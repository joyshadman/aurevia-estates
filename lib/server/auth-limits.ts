import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { db } from "@/lib/server/db";
import { uuidv7 } from "@/lib/server/uuid";

// Our own auth rate limiter (spec 0008, *Rate limits*, AC-4). Better Auth's
// limiter only runs on HTTP requests, and its endpoints are closed, so every
// public auth action counts here first. Counts live in `rate_limits`; on in
// every environment (locally every request shares the `local` key).

const minute = 60_000;

// Fixed windows: `last_request` holds when the current window started.
const limits = {
  // Sign in, sign up, and code entry.
  attempt: { ip: { max: 30, windowMs: 5 * minute }, email: { max: 10, windowMs: 5 * minute } },
  // Anything that sends an email.
  email: { ip: { max: 10, windowMs: 60 * minute }, email: { max: 5, windowMs: 60 * minute } },
  // The public contact form (spec 0015, AC-3): 5 an hour per IP.
  contact: { ip: { max: 5, windowMs: 60 * minute }, email: { max: 5, windowMs: 60 * minute } },
} as const;

export type LimitKind = keyof typeof limits;

// The client IP, from Vercel's own header (never `x-forwarded-for`, which a
// client can set).
export async function clientIp(): Promise<string> {
  const list = await headers();
  const forwarded = list.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || list.get("x-real-ip")?.trim() || "local";
}

// Counts one request against `key` and says whether it is within `max`.
async function consume(key: string, max: number, windowMs: number): Promise<boolean> {
  const now = Date.now();
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limits (id, key, count, last_request)
    VALUES (${uuidv7()}::uuid, ${key}, 1, ${now}::bigint)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.last_request <= ${now - windowMs}::bigint THEN 1 ELSE rate_limits.count + 1 END,
      last_request = CASE WHEN rate_limits.last_request <= ${now - windowMs}::bigint THEN ${now}::bigint ELSE rate_limits.last_request END
    RETURNING count`;
  return (rows[0]?.count ?? Infinity) <= max;
}

// Runs at the top of every public auth action, after captcha. `action` names
// the action, so each one has its own budget. `email` is omitted where a per
// email count would reveal whether an account exists (password reset).
export async function withinAuthLimits(action: string, kind: LimitKind, email?: string): Promise<boolean> {
  const rule = limits[kind];
  const checks = [consume(`ip:${action}:${await clientIp()}`, rule.ip.max, rule.ip.windowMs)];
  if (email) checks.push(consume(`email:${action}:${email.toLowerCase()}`, rule.email.max, rule.email.windowMs));
  return (await Promise.all(checks)).every(Boolean);
}

// ---------------------------------------------------------------------------
// Per email cooldown between code emails (AC-2): 60 seconds per type.

export const cooldownMs = 60_000;

// Claims the right to send now. False means a code went out less than 60
// seconds ago; the row is left alone so the countdown keeps its start. Call it
// in the action before `auth.api.*`: Better Auth replaces the stored code
// before its email callback runs, so a refusal there would kill the code
// already in the user's inbox. `type` is Better Auth's code type.
export async function claimEmailCooldown(type: string, email: string): Promise<boolean> {
  const now = Date.now();
  const rows = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO rate_limits (id, key, count, last_request)
    VALUES (${uuidv7()}::uuid, ${`cooldown:${type}:${email.toLowerCase()}`}, 1, ${now}::bigint)
    ON CONFLICT (key) DO UPDATE SET count = rate_limits.count + 1, last_request = ${now}::bigint
      WHERE rate_limits.last_request <= ${now - cooldownMs}::bigint
    RETURNING id`;
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Wrong authenticator or backup codes per pending sign in (AC-9): 5, counted
// under `2fa:<sha256 of the 2FA cookie>`. The plugin's own cap is a backstop;
// this one is ours, so the fifth wrong code ends the step and Sentry hears of it.

export const twoFactorMaxWrong = 5;

const twoFactorKey = (cookieValue: string) => `2fa:${createHash("sha256").update(cookieValue).digest("hex")}`;

export async function twoFactorWrongCount(cookieValue: string): Promise<number> {
  const row = await db.rateLimit.findUnique({ where: { key: twoFactorKey(cookieValue) }, select: { count: true } });
  return row?.count ?? 0;
}

// Counts one wrong code and returns the new total.
export async function recordWrongTwoFactorCode(cookieValue: string): Promise<number> {
  const now = Date.now();
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limits (id, key, count, last_request)
    VALUES (${uuidv7()}::uuid, ${twoFactorKey(cookieValue)}, 1, ${now}::bigint)
    ON CONFLICT (key) DO UPDATE SET count = rate_limits.count + 1, last_request = ${now}::bigint
    RETURNING count`;
  return rows[0]?.count ?? twoFactorMaxWrong;
}
