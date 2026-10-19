"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { AuthFailure } from "@/lib/domain/auth-messages";
import { CODE_COOLDOWN_SECONDS, emailRule, hasFreshMfa, passwordRule } from "@/lib/domain/auth-rules";
import { mfaState } from "@/lib/server/auth";
import { authReason, authRedirect, cleanNext, completeSignIn } from "@/lib/server/sign-in";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Sign in actions (spec 0004, *API surface*). Built so far: password sign up and
// sign in, the code step that confirms them, the email link Continue button,
// forgot password, the MFA challenge, and sign out.
// TODO(spec 0004, build plan 1, 2, 4): email code sign in, hCaptcha tokens on
// every public request, and Google, once their keys exist.

const fail = (reason: AuthFailure["reason"], extra: Partial<AuthFailure> = {}): AuthFailure => ({ ok: false, reason, ...extra });

export type SignInState = AuthFailure | { ok: true; step: "verify"; email: string; purpose: "signup" | "recovery"; cooldownSeconds: number } | null;

const field = (form: FormData, name: string) => String(form.get(name) ?? "");

export async function signInWithPasswordAction(_: SignInState, form: FormData): Promise<SignInState> {
  const email = emailRule.safeParse(field(form, "email"));
  if (!email.success) return fail("invalid_email");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email: email.data, password: field(form, "password") });
  if (error) return fail(authReason(error, "invalid_credentials"));
  return completeSignIn(field(form, "next"));
}

// A new account gets no session until its email is confirmed (AC-3). An existing
// email gets the same answer, so the form never reveals who has an account.
export async function signUpWithPasswordAction(_: SignInState, form: FormData): Promise<SignInState> {
  const email = emailRule.safeParse(field(form, "email"));
  if (!email.success) return fail("invalid_email");
  const password = passwordRule.safeParse(field(form, "password"));
  if (!password.success) return fail("weak_password");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email: email.data,
    password: password.data,
    options: { emailRedirectTo: authRedirect("confirm", cleanNext(field(form, "next"))) },
  });
  if (error && error.code !== "user_already_exists") return fail(authReason(error));
  return { ok: true, step: "verify", email: email.data, purpose: "signup", cooldownSeconds: CODE_COOLDOWN_SECONDS };
}

// Always the same answer, whether or not the email has an account (AC-7).
export async function requestPasswordResetAction(_: SignInState, form: FormData): Promise<SignInState> {
  const email = emailRule.safeParse(field(form, "email"));
  if (!email.success) return fail("invalid_email");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: authRedirect("confirm", "/sign-in/new-password"),
  });
  if (error && authReason(error) === "rate_limited") return fail("rate_limited", { cooldownSeconds: CODE_COOLDOWN_SECONDS });
  return { ok: true, step: "verify", email: email.data, purpose: "recovery", cooldownSeconds: CODE_COOLDOWN_SECONDS };
}

const codeInput = z.object({
  email: emailRule,
  token: z.string().trim().regex(/^\d{6}$/),
  purpose: z.enum(["signin", "signup", "recovery"]),
});

// The 6 digit code from the email (AC-2, AC-3, AC-7).
export async function verifyEmailCodeAction(_: SignInState, form: FormData): Promise<SignInState> {
  const parsed = codeInput.safeParse({ email: field(form, "email"), token: field(form, "token"), purpose: field(form, "purpose") });
  if (!parsed.success) return fail("otp_invalid");
  const { email, token, purpose } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: purpose === "recovery" ? "recovery" : "email" });
  if (error) return fail(authReason(error, "otp_invalid"));
  return completeSignIn(purpose === "recovery" ? "/sign-in/new-password" : field(form, "next"));
}

export async function resendSignupCodeAction(email: string): Promise<AuthFailure | { ok: true; cooldownSeconds: number }> {
  const parsed = emailRule.safeParse(email);
  if (!parsed.success) return fail("invalid_email");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resend({ type: "signup", email: parsed.data, options: { emailRedirectTo: authRedirect("confirm", null) } });
  if (error) return fail(authReason(error), { cooldownSeconds: CODE_COOLDOWN_SECONDS });
  return { ok: true, cooldownSeconds: CODE_COOLDOWN_SECONDS };
}

// The Continue button on `/auth/confirm`: the GET never spends the token, so mail
// scanners can open the link safely (AC-2).
export async function confirmEmailLinkAction(_: SignInState, form: FormData): Promise<SignInState> {
  const parsed = z
    .object({ tokenHash: z.string().min(10).max(200), type: z.enum(["email", "recovery", "signup"]) })
    .safeParse({ tokenHash: field(form, "tokenHash"), type: field(form, "type") });
  if (!parsed.success) return fail("link_invalid");
  const supabase = await createSupabaseServerClient();
  const type = parsed.data.type === "recovery" ? "recovery" : "email";
  const { error } = await supabase.auth.verifyOtp({ token_hash: parsed.data.tokenHash, type });
  if (error) return fail("link_invalid");
  return completeSignIn(type === "recovery" ? "/sign-in/new-password" : field(form, "next"));
}

// After a recovery sign in. A user with an authenticator passes `/mfa` first (AC-7).
export async function setNewPasswordAction(_: SignInState, form: FormData): Promise<SignInState> {
  const password = passwordRule.safeParse(field(form, "password"));
  if (!password.success) return fail("weak_password");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return fail("link_invalid");
  const mfa = await mfaState();
  if (mfa.verified.length > 0 && !hasFreshMfa(mfa.level, mfa.amr, Date.now())) redirect("/mfa?next=%2Fsign-in%2Fnew-password");
  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) return fail(authReason(error));
  return completeSignIn(null);
}

// The TOTP challenge (AC-8, AC-9).
export async function challengeMfaAction(_: SignInState, form: FormData): Promise<SignInState> {
  const parsed = z
    .object({ factorId: z.uuid(), code: z.string().trim().regex(/^\d{6}$/) })
    .safeParse({ factorId: field(form, "factorId"), code: field(form, "code") });
  if (!parsed.success) return fail("otp_invalid");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify(parsed.data);
  if (error) return fail(authReason(error, "otp_invalid"));
  return completeSignIn(field(form, "next"));
}

// This device only (AC-15).
export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/");
}

// Every device (AC-10, AC-15).
export async function signOutEverywhereAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/sign-in");
}
