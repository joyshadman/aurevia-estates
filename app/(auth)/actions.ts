"use server";

import { hashPassword } from "better-auth/crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { codeCooldownSeconds, codeLength, type AuthReason } from "@/lib/auth/messages";
import { isStrongPassword } from "@/lib/auth/password";
import { routes } from "@/lib/nav";
import {
  clearPendingTwoFactor,
  completeSignIn,
  pendingTwoFactor,
  safeNext,
  signInPath,
} from "@/lib/server/auth";
import { getAuth } from "@/lib/server/auth-config";
import { authErrorCode, authReason } from "@/lib/server/auth-errors";
import {
  claimEmailCooldown,
  recordWrongTwoFactorCode,
  twoFactorMaxWrong,
  twoFactorWrongCount,
  withinAuthLimits,
  type LimitKind,
} from "@/lib/server/auth-limits";
import { withAuthRequest } from "@/lib/server/auth-request";
import { verifyCaptcha } from "@/lib/server/captcha";
import { db } from "@/lib/server/db";
import { reportError, reportEvent } from "@/lib/server/report";

// Sign in actions (spec 0008, *API surface*). Better Auth's HTTP endpoints are
// closed, so these are the only way in (AC-4): each validates with Zod, checks
// hCaptcha once and our rate limiter, then calls `auth.api.*`. They return
// `{ ok: false, reason }` for the page to show, or redirect on success.

export type ActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; reason: AuthReason };

const email = z.string().trim().toLowerCase().max(320).pipe(z.email());
const next = z.string().max(600).optional();
const code = z.string().trim().regex(new RegExp(String.raw`^\d{${codeLength}}$`));
// One hCaptcha token per request; tokens are single use (AC-4).
const captchaToken = z.string().min(1).max(10_000);

// AC-4: hCaptcha first, then the per IP and per email limits.
async function guard(action: string, kind: LimitKind, token: string, forEmail?: string): Promise<AuthReason | null> {
  if (!(await verifyCaptcha(token))) return "captcha_failed";
  if (!(await withinAuthLimits(action, kind, forEmail))) return "rate_limited";
  return null;
}

// Sign up and password reset take the same time whether or not the account
// exists (spec 0008, *Key invariants*): the slower path sets the floor.
const steadyResponseMs = 800;

async function steady<T>(run: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    return await run();
  } finally {
    const left = steadyResponseMs - (Date.now() - started);
    if (left > 0) await new Promise((resolve) => setTimeout(resolve, left));
  }
}

// A password sign in for a user with 2FA on ends at the authenticator step:
// Better Auth sets its temporary 2FA cookie and answers `twoFactorRedirect`
// instead of a session (AC-7, AC-8).
async function finishPasswordSignIn(next: string | undefined, result: object): Promise<never> {
  if ("twoFactorRedirect" in result && result.twoFactorRedirect) {
    const params = new URLSearchParams({ step: "2fa" });
    const safe = safeNext(next);
    if (safe) params.set("next", safe);
    redirect(`${routes.signIn}?${params}`);
  }
  return completeSignIn(next, result as { user: object });
}

// ---------------------------------------------------------------------------
// Email code (AC-2).

export async function requestEmailCode(input: {
  email: string;
  captchaToken: string;
  next?: string;
}): Promise<ActionResult<{ cooldownSeconds: number }>> {
  const parsed = z.object({ email, captchaToken, next }).safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues.some((i) => i.path[0] === "email") ? "invalid_email" : "captcha_failed" };
  }
  const blocked = await guard("requestEmailCode", "email", parsed.data.captchaToken, parsed.data.email);
  if (blocked) return { ok: false, reason: blocked };
  if (!(await claimEmailCooldown("sign-in", parsed.data.email))) return { ok: false, reason: "rate_limited" };

  try {
    const requestHeaders = await headers();
    await withAuthRequest({ next: parsed.data.next }, () =>
      getAuth().api.sendVerificationOTP({ body: { email: parsed.data.email, type: "sign-in" }, headers: requestHeaders }),
    );
  } catch (error) {
    return { ok: false, reason: authReason(error, "email_send_failed") };
  }
  return { ok: true, cooldownSeconds: codeCooldownSeconds };
}

// Signs in with a code from an email: a sign in code (creating the account on
// first use) or the confirmation code after a password sign up (AC-3).
// Returns the signed in user for `completeSignIn`, or null when no session was made.
async function redeemEmailCode(input: { email: string; code: string; purpose: "signin" | "signup" }) {
  const api = getAuth().api;
  const body = { email: input.email, otp: input.code };
  const requestHeaders = await headers();
  const result =
    input.purpose === "signin"
      ? await api.signInEmailOTP({ body, headers: requestHeaders })
      : await api.verifyEmailOTP({ body, headers: requestHeaders });
  return result.token ? result : null;
}

const verifyInput = z.object({
  email,
  code,
  purpose: z.enum(["signin", "signup"]),
  captchaToken,
  next,
});

// Code entry on `/sign-in`. Success redirects, so it only ever returns a failure.
export async function verifyEmailCode(input: z.input<typeof verifyInput>): Promise<ActionResult> {
  const parsed = verifyInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "otp_invalid" };
  const blocked = await guard("verifyEmailCode", "attempt", parsed.data.captchaToken, parsed.data.email);
  if (blocked) return { ok: false, reason: blocked };

  let signedIn;
  try {
    signedIn = await redeemEmailCode(parsed.data);
  } catch (error) {
    return { ok: false, reason: authReason(error, "otp_invalid") };
  }
  return completeSignIn(parsed.data.next, signedIn);
}

const confirmInput = z.object({
  email,
  code,
  type: z.enum(["sign-in", "verify"]),
  captchaToken,
  next,
});

// Continue on `/auth/confirm`. Opening the link never uses the code (mail
// scanners prefetch links); only this action does (AC-2).
export async function confirmEmailLink(input: z.input<typeof confirmInput>): Promise<ActionResult> {
  const parsed = confirmInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "link_invalid" };
  const blocked = await guard("confirmEmailLink", "attempt", parsed.data.captchaToken, parsed.data.email);
  if (blocked) return { ok: false, reason: blocked };

  let signedIn;
  try {
    signedIn = await redeemEmailCode({ ...parsed.data, purpose: parsed.data.type === "sign-in" ? "signin" : "signup" });
  } catch (error) {
    const reason = authReason(error, "link_invalid");
    return { ok: false, reason: reason === "otp_invalid" ? "link_invalid" : reason };
  }
  return completeSignIn(parsed.data.next, signedIn);
}

// This device only (AC-15).
export async function signOut() {
  try {
    const requestHeaders = await headers();
    await getAuth().api.signOut({ headers: requestHeaders });
  } catch (error) {
    reportError("auth.sign_out_failed", error);
  }
  redirect(routes.home);
}

// ---------------------------------------------------------------------------
// Password (AC-3, AC-7, AC-13).

const passwordInput = z.object({ email, password: z.string().max(200), captchaToken, next });

export async function signUpWithPassword(input: z.input<typeof passwordInput>): Promise<ActionResult<{ step: "verify" }>> {
  const parsed = passwordInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid_email" };
  if (!isStrongPassword(parsed.data.password)) return { ok: false, reason: "weak_password" };
  const blocked = await guard("signUpWithPassword", "attempt", parsed.data.captchaToken, parsed.data.email);
  if (blocked) return { ok: false, reason: blocked };

  const { email: address, password } = parsed.data;
  const requestHeaders = await headers();
  // An existing email gets the same answer, in the same time (no account enumeration).
  await steady(() =>
    withAuthRequest({ next: parsed.data.next }, async () => {
      const api = getAuth().api;
      const existing = await db.profile.findUnique({
        where: { email: address },
        select: { id: true, emailVerified: true, accounts: { where: { providerId: "credential" }, select: { id: true } } },
      });
      try {
        if (!existing) {
          // Sends the confirmation code after the response (`sendVerificationOnSignUp`),
          // which starts the 60 second clock like any other code.
          await claimEmailCooldown("email-verification", address);
          await api.signUpEmail({ body: { email: address, password, name: "" }, headers: requestHeaders });
        } else if (!existing.emailVerified) {
          // The newest sign up's password wins, so an earlier one set by someone
          // else never survives the owner's confirmation (AC-13).
          const hash = await hashPassword(password);
          const [credential] = existing.accounts;
          if (credential) await db.account.update({ where: { id: credential.id }, data: { password: hash } });
          else {
            await db.account.create({
              data: { userId: existing.id, providerId: "credential", accountId: existing.id, password: hash },
            });
          }
          // Inside the cooldown the code already sent still works; send nothing.
          if (await claimEmailCooldown("email-verification", address)) {
            await api.sendVerificationOTP({ body: { email: address, type: "email-verification" }, headers: requestHeaders });
          }
        }
      } catch (error) {
        // Already exists (a race with another sign up) answers like success; anything else is reported.
        if (authErrorCode(error)?.startsWith("USER_ALREADY_EXISTS")) return;
        reportError("auth.sign_up_failed", error, { code: authErrorCode(error) });
      }
    }),
  );
  // No session until the email is confirmed; the page shows the code entry step.
  return { ok: true, step: "verify" };
}

// "Send code" after `email_not_confirmed`, and "Send a new code" on the confirm step (AC-3).
export async function resendSignupCode(input: {
  email: string;
  captchaToken: string;
  next?: string;
}): Promise<ActionResult<{ cooldownSeconds: number }>> {
  const parsed = z.object({ email, captchaToken, next }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid_email" };
  const blocked = await guard("resendSignupCode", "email", parsed.data.captchaToken, parsed.data.email);
  if (blocked) return { ok: false, reason: blocked };

  const requestHeaders = await headers();
  await steady(() =>
    withAuthRequest({ next: parsed.data.next }, async () => {
      // Inside the cooldown, answer the same and send nothing (AC-2).
      if (!(await claimEmailCooldown("email-verification", parsed.data.email))) return;
      try {
        await getAuth().api.sendVerificationOTP({
          body: { email: parsed.data.email, type: "email-verification" },
          headers: requestHeaders,
        });
      } catch (error) {
        reportError("auth.signup_code_failed", error, { code: authErrorCode(error) });
      }
    }),
  );
  return { ok: true, cooldownSeconds: codeCooldownSeconds };
}

export async function signInWithPassword(input: z.input<typeof passwordInput>): Promise<ActionResult> {
  const parsed = z.object({ email, password: z.string().min(1).max(200), captchaToken, next }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid_credentials" };
  const blocked = await guard("signInWithPassword", "attempt", parsed.data.captchaToken, parsed.data.email);
  if (blocked) return { ok: false, reason: blocked };

  let signedIn;
  try {
    const requestHeaders = await headers();
    signedIn = await getAuth().api.signInEmail({
      body: { email: parsed.data.email, password: parsed.data.password },
      headers: requestHeaders,
    });
  } catch (error) {
    return { ok: false, reason: authReason(error, "invalid_credentials") };
  }
  return finishPasswordSignIn(parsed.data.next, signedIn);
}

// Always the same answer, in the same time, whether or not the email has an
// account (AC-7). Limited per IP only: a per email count would reveal it.
export async function requestPasswordReset(input: {
  email: string;
  captchaToken: string;
}): Promise<ActionResult<{ cooldownSeconds: number }>> {
  const parsed = z.object({ email, captchaToken }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid_email" };
  const blocked = await guard("requestPasswordReset", "email", parsed.data.captchaToken);
  if (blocked) return { ok: false, reason: blocked };

  const requestHeaders = await headers();
  await steady(async () => {
    // Inside the cooldown, answer the same and send nothing (AC-2).
    if (!(await claimEmailCooldown("forget-password", parsed.data.email))) return;
    try {
      await getAuth().api.requestPasswordResetEmailOTP({ body: { email: parsed.data.email }, headers: requestHeaders });
    } catch (error) {
      reportError("auth.reset_request_failed", error, { code: authErrorCode(error) });
    }
  });
  return { ok: true, cooldownSeconds: codeCooldownSeconds };
}

const newPasswordInput = z.object({ email, code, password: z.string().max(200), captchaToken, next });

// "Set a new password", from the reset step on `/sign-in` (typed code) or on
// `/auth/confirm` (link). Saving it marks the email verified and ends every
// other session, then signs in with the new password (AC-7).
export async function setNewPassword(input: z.input<typeof newPasswordInput>): Promise<ActionResult> {
  const parsed = newPasswordInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues.some((i) => i.path[0] === "code") ? "otp_invalid" : "invalid_email" };
  }
  if (!isStrongPassword(parsed.data.password)) return { ok: false, reason: "weak_password" };
  const blocked = await guard("setNewPassword", "attempt", parsed.data.captchaToken, parsed.data.email);
  if (blocked) return { ok: false, reason: blocked };

  const api = getAuth().api;
  const requestHeaders = await headers();
  const body = { email: parsed.data.email, password: parsed.data.password };
  try {
    // Better Auth also sets `email_verified`: the code proved the address.
    await api.resetPasswordEmailOTP({ body: { ...body, otp: parsed.data.code }, headers: requestHeaders });
  } catch (error) {
    return { ok: false, reason: authReason(error, "otp_invalid") };
  }
  let signedIn;
  try {
    signedIn = await api.signInEmail({ body, headers: requestHeaders });
  } catch (error) {
    return { ok: false, reason: authReason(error, "invalid_credentials") };
  }
  // A user with 2FA goes on to the authenticator step before any session (AC-7).
  return finishPasswordSignIn(parsed.data.next, signedIn);
}

// ---------------------------------------------------------------------------
// Authenticator step (AC-8, AC-9). No captcha: the 2FA cookie, set only after
// a correct password, is the guard, and wrong codes are capped per cookie.

const twoFactorInput = z.object({
  code: z.string().trim().min(6).max(20),
  kind: z.enum(["totp", "backup"]),
  next,
});

export async function verifyTwoFactor(input: z.input<typeof twoFactorInput>): Promise<ActionResult> {
  const parsed = twoFactorInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "otp_invalid" };
  const pending = await pendingTwoFactor();
  if (!pending) return { ok: false, reason: "two_factor_expired" };

  // Five wrong codes end the step: the password is needed again (AC-9).
  const locked = async () => {
    await clearPendingTwoFactor();
    reportEvent("auth.two_factor_locked", { kind: parsed.data.kind });
    return { ok: false, reason: "too_many_attempts" } as const;
  };
  if ((await twoFactorWrongCount(pending.value)) >= twoFactorMaxWrong) return locked();

  let signedIn;
  try {
    const api = getAuth().api;
    const request = { body: { code: parsed.data.code }, headers: await headers() };
    signedIn = parsed.data.kind === "totp" ? await api.verifyTOTP(request) : await api.verifyBackupCode(request);
  } catch (error) {
    const reason = authReason(error, "otp_invalid");
    if (reason === "otp_invalid" && (await recordWrongTwoFactorCode(pending.value)) >= twoFactorMaxWrong) return locked();
    if (reason === "too_many_attempts") return locked();
    if (reason === "two_factor_expired") await clearPendingTwoFactor();
    return { ok: false, reason };
  }
  return completeSignIn(parsed.data.next, signedIn);
}

// Ends this device's session and opens `/sign-in` for `next`: for an agent
// whose session is too old to set up or change 2FA (AC-8, AC-9).
export async function signInAgain(input: { next?: string }) {
  const parsed = z.object({ next }).safeParse(input);
  try {
    await getAuth().api.signOut({ headers: await headers() });
  } catch (error) {
    reportError("auth.sign_out_failed", error);
  }
  redirect(signInPath(parsed.success ? parsed.data.next : undefined));
}

// ---------------------------------------------------------------------------
// Google (AC-5). No captcha: Google does its own checks.

export async function startGoogle(input: { next?: string }): Promise<ActionResult> {
  const parsed = z.object({ next }).safeParse(input);
  const safe = safeNext(parsed.success ? parsed.data.next : undefined);
  const callbackURL = safe ? `/auth/continue?${new URLSearchParams({ next: safe })}` : "/auth/continue";

  let url: string | undefined;
  try {
    const result = await getAuth().api.signInSocial({
      body: {
        provider: "google",
        callbackURL,
        errorCallbackURL: `${routes.signIn}?error=google_cancelled`,
        disableRedirect: true,
      },
      headers: await headers(),
    });
    url = result.url;
  } catch (error) {
    reportError("auth.google_start_failed", error, { code: authErrorCode(error) });
  }
  if (!url) return { ok: false, reason: "google_unavailable" };
  redirect(url);
}
