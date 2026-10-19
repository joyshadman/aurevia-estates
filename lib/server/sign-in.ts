import "server-only";
import type { AuthError, User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { AuthReason } from "@/lib/domain/auth-messages";
import { defaultLanding, safeNext } from "@/lib/domain/auth-rules";
import { publicEnv } from "@/lib/env";
import { db } from "@/lib/server/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Sign in completion and helpers (spec 0004, *Sign in completion*).

export function siteUrl() {
  return publicEnv().NEXT_PUBLIC_SITE_URL;
}

export function cleanNext(value: unknown): string | null {
  return safeNext(value, siteUrl());
}

// Every redirect we hand to Supabase is built from the site URL (AC-11).
export function authRedirect(kind: "confirm" | "callback", next: string | null) {
  return `${siteUrl()}/auth/${kind}?next=${encodeURIComponent(next ?? "")}`;
}

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : null);

// Creates the profile on first sign in (`on conflict do nothing`, so concurrent
// first requests are safe). Name and avatar come from Google when present; they
// are display data only, never used for authorization (AC-6).
export async function ensureProfile(user: User) {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  await db.$executeRaw`
    INSERT INTO profiles (id, email, full_name, avatar_url, created_at, updated_at)
    VALUES (${user.id}::uuid, ${user.email ?? null}, ${text(meta.full_name) ?? text(meta.name)},
            ${text(meta.avatar_url) ?? text(meta.picture)}, now(), now())
    ON CONFLICT (id) DO NOTHING`;
  return db.profile.findUniqueOrThrow({ where: { id: user.id }, select: { role: true, deletedAt: true } });
}

// The end of every sign in path: profile first, then the landing (AC-1, AC-6, AC-12).
export async function completeSignIn(next: unknown): Promise<never> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/sign-in?error=link_invalid");
  const profile = await ensureProfile(data.user);
  if (profile.deletedAt) {
    await supabase.auth.signOut({ scope: "local" });
    redirect("/sign-in?error=account_deleted");
  }
  redirect(cleanNext(next) ?? defaultLanding(profile.role));
}

// Supabase error codes to our reasons (spec 0004, *Error messages*).
export function authReason(error: AuthError | null | undefined, fallback: AuthReason = "unknown"): AuthReason {
  const code = error?.code ?? "";
  if (code === "invalid_credentials") return "invalid_credentials";
  if (code === "email_not_confirmed") return "email_not_confirmed";
  if (code === "weak_password") return "weak_password";
  if (code === "otp_expired" || code === "otp_disabled") return "otp_invalid";
  if (code === "captcha_failed") return "captcha_failed";
  if (code === "email_address_invalid") return "invalid_email";
  if (code.startsWith("over_") || error?.status === 429) return "rate_limited";
  if (code.startsWith("hook_") || code === "email_provider_disabled") return "email_send_failed";
  if (code === "reauthentication_not_valid" || code === "reauthentication_needed") return "nonce_invalid";
  if (code === "identity_already_exists") return "identity_already_exists";
  if (code === "single_identity_not_deletable") return "last_method";
  if (code === "mfa_verification_failed" || code === "mfa_challenge_expired") return "otp_invalid";
  if (code === "insufficient_aal") return "mfa_required";
  return fallback;
}
