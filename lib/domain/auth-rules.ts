import { z } from "zod";

// Sign in rules (spec 0004). Pure: the server, the pages, and the tests share
// them. Times are milliseconds; Supabase `amr` timestamps are seconds.

export const MFA_FRESH_MS = 12 * 60 * 60 * 1000;
export const AGENT_ENROLL_WINDOW_MS = 15 * 60 * 1000;
export const STALE_UNVERIFIED_FACTOR_MS = 60 * 60 * 1000;
export const CODE_COOLDOWN_SECONDS = 60;

// AC-11: only same site paths, never under /auth/ or /api/.
export function safeNext(value: unknown, siteUrl: string): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length >= 512) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("\\") || /%5c|%2f/i.test(value)) return null;
  for (const char of value) if (char.charCodeAt(0) < 0x20) return null;
  let url: URL;
  try {
    url = new URL(value, siteUrl);
  } catch {
    return null;
  }
  if (url.origin !== new URL(siteUrl).origin) return null;
  if (url.pathname.startsWith("/auth/") || url.pathname.startsWith("/api/")) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

// AC-12.
export function defaultLanding(role: string): string {
  return role === "AGENT" ? "/dashboard/leads" : "/assistant";
}

// AC-3: 8+ characters with at least one letter and one digit.
export const passwordRule = z
  .string()
  .min(8, "weak_password")
  .max(72, "weak_password")
  .refine((value) => /\p{L}/u.test(value) && /\d/.test(value), "weak_password");

export const emailRule = z.string().trim().toLowerCase().pipe(z.email());

export type AmrEntry = { method: string; timestamp: number };

// Supabase may return plain method names (no timestamps); those never count as fresh.
export function amrEntries(raw: unknown): AmrEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry): entry is AmrEntry =>
      typeof entry === "object" && entry !== null && typeof entry.method === "string" && typeof entry.timestamp === "number",
  );
}

export function lastTotpAt(amr: AmrEntry[]): number | null {
  const times = amr.filter((e) => e.method === "totp").map((e) => e.timestamp * 1000);
  return times.length > 0 ? Math.max(...times) : null;
}

// When the session was signed in: the newest entry of any method.
export function signedInAt(amr: AmrEntry[]): number | null {
  const times = amr.map((e) => e.timestamp * 1000);
  return times.length > 0 ? Math.max(...times) : null;
}

export function hasFreshMfa(level: string | null, amr: AmrEntry[], now: number): boolean {
  const totp = lastTotpAt(amr);
  return level === "aal2" && totp !== null && now - totp <= MFA_FRESH_MS;
}

// AC-8, after the session and role checks: setup when no verified
// authenticator, a code when the session isn't aal2 or the code is stale.
export function agentGate(input: { hasVerifiedTotp: boolean; level: string | null; amr: AmrEntry[]; now: number }): "ok" | "setup" | "mfa" {
  if (!input.hasVerifiedTotp) return "setup";
  return hasFreshMfa(input.level, input.amr, input.now) ? "ok" : "mfa";
}

// AC-9: an agent may enroll only within 15 minutes of signing in.
export function withinEnrollWindow(amr: AmrEntry[], now: number): boolean {
  const at = signedInAt(amr);
  return at !== null && now - at <= AGENT_ENROLL_WINDOW_MS;
}
