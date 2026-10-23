"use server";

import { isSupportedCountry, parsePhoneNumberFromString } from "libphonenumber-js/min";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { z } from "zod";
import { codeCooldownSeconds, codeLength, type AuthReason } from "@/lib/auth/messages";
import { isStrongPassword } from "@/lib/auth/password";
import { routes } from "@/lib/nav";
import {
  getCurrentUser,
  getSecurityState,
  requireFreshTwoFactor,
  signInPath,
  canEnrollTwoFactor,
} from "@/lib/server/auth";
import { getAuth } from "@/lib/server/auth-config";
import { authErrorCode, authReason } from "@/lib/server/auth-errors";
import { claimEmailCooldown, withinAuthLimits } from "@/lib/server/auth-limits";
import { withAuthRequest } from "@/lib/server/auth-request";
import { db } from "@/lib/server/db";
import { reportError, reportEvent } from "@/lib/server/report";

// Account actions (spec 0008, *API surface*, AC-9, AC-10, AC-15). Each checks
// the session on the server first, then calls `auth.api.*` with this request's
// headers, and returns `{ ok: false, reason }` for the page to show.

export type ActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; reason: AuthReason };

const password = z.string().min(1).max(200);
const sixDigits = z.string().trim().regex(new RegExp(String.raw`^\d{${codeLength}}$`));

async function signedInUser() {
  // `refresh: true`: taking an action extends a visitor's session (AC-15).
  const user = await getCurrentUser({ refresh: true });
  if (!user) redirect(signInPath(routes.account));
  return user;
}

async function securityState() {
  const state = await getSecurityState({ refresh: true });
  if (!state) redirect(signInPath("/account/security"));
  return state;
}

// ---------------------------------------------------------------------------
// Profile (AC-10).

const profileInput = z.object({
  fullName: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(40),
  countryCode: z.string().length(2),
});

export async function updateProfile(input: z.input<typeof profileInput>): Promise<ActionResult<{ phone: string | null }>> {
  const user = await signedInUser();
  const parsed = profileInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues.some((i) => i.path[0] === "fullName") ? "invalid_name" : "invalid_phone" };
  }

  // Empty clears the phone; anything else must be a valid number, saved in E.164.
  let phone: string | null = null;
  if (parsed.data.phone) {
    if (!isSupportedCountry(parsed.data.countryCode)) return { ok: false, reason: "invalid_phone" };
    const number = parsePhoneNumberFromString(parsed.data.phone, parsed.data.countryCode);
    if (!number?.isValid()) return { ok: false, reason: "invalid_phone" };
    phone = number.number;
  }

  await db.profile.update({ where: { id: user.id }, data: { fullName: parsed.data.fullName, phone } });
  return { ok: true, phone };
}

// ---------------------------------------------------------------------------
// Password (AC-10). Either path ends every other session.

export async function changePassword(input: { currentPassword: string; password: string }): Promise<ActionResult> {
  const user = await signedInUser();
  const parsed = z.object({ currentPassword: password, password: z.string().max(200) }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid_credentials" };
  if (!isStrongPassword(parsed.data.password)) return { ok: false, reason: "weak_password" };
  if (!(await withinAuthLimits("changePassword", "attempt", user.email))) return { ok: false, reason: "rate_limited" };

  try {
    await getAuth().api.changePassword({
      body: { currentPassword: parsed.data.currentPassword, newPassword: parsed.data.password, revokeOtherSessions: true },
      headers: await headers(),
    });
  } catch (error) {
    return { ok: false, reason: authReason(error, "invalid_credentials") };
  }
  return { ok: true };
}

// "Set a password" for an account that has none (Google or email code only):
// a code to the account's own email, awaited so a failed send shows (AC-13).
export async function requestSetPasswordCode(): Promise<ActionResult<{ cooldownSeconds: number }>> {
  const state = await securityState();
  if (state.hasPassword) return { ok: false, reason: "invalid_credentials" };
  const email = state.user.email;
  if (!(await withinAuthLimits("requestSetPasswordCode", "email", email))) return { ok: false, reason: "rate_limited" };
  if (!(await claimEmailCooldown("forget-password", email))) return { ok: false, reason: "rate_limited" };

  try {
    const requestHeaders = await headers();
    await withAuthRequest({ awaitResetEmail: true }, () =>
      getAuth().api.requestPasswordResetEmailOTP({ body: { email }, headers: requestHeaders }),
    );
  } catch (error) {
    return { ok: false, reason: authReason(error, "email_send_failed") };
  }
  return { ok: true, cooldownSeconds: codeCooldownSeconds };
}

export async function setFirstPassword(input: { code: string; password: string }): Promise<ActionResult> {
  const state = await securityState();
  if (state.hasPassword) return { ok: false, reason: "invalid_credentials" };
  const parsed = z.object({ code: sixDigits, password: z.string().max(200) }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "otp_invalid" };
  if (!isStrongPassword(parsed.data.password)) return { ok: false, reason: "weak_password" };
  if (!(await withinAuthLimits("setFirstPassword", "attempt", state.user.email))) return { ok: false, reason: "rate_limited" };

  const api = getAuth().api;
  const requestHeaders = await headers();
  const body = { email: state.user.email, password: parsed.data.password };
  try {
    await api.resetPasswordEmailOTP({ body: { ...body, otp: parsed.data.code }, headers: requestHeaders });
  } catch (error) {
    return { ok: false, reason: authReason(error, "otp_invalid") };
  }
  // The reset ends every session, this one too (`revokeSessionsOnPasswordReset`).
  // Sign this device straight back in with the new password, so only the
  // other sessions end (AC-10).
  try {
    const result = await api.signInEmail({ body, headers: requestHeaders });
    if ("twoFactorRedirect" in result && result.twoFactorRedirect) redirect(signInPath("/account"));
  } catch (error) {
    reportError("auth.first_password_sign_in_failed", error, { code: authErrorCode(error) });
    redirect(signInPath("/account"));
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Two step verification (AC-9).

// Step 1 of turning 2FA on: the password, then the QR code and key to scan.
// 2FA is not on until `confirmTwoFactor` checks a first code.
export async function enableTwoFactor(input: {
  password: string;
}): Promise<ActionResult<{ qrCode: string; secret: string; backupCodes: string[] }>> {
  const state = await securityState();
  const parsed = z.object({ password }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid_credentials" };
  if (state.user.twoFactorEnabled) return { ok: false, reason: "mfa_required" };
  if (!state.hasPassword) return { ok: false, reason: "invalid_credentials" };
  // An agent turns it on only right after signing in, so a stolen session can't.
  if (!canEnrollTwoFactor(state)) {
    return { ok: false, reason: "reauth_required" };
  }
  if (!(await withinAuthLimits("enableTwoFactor", "attempt", state.user.email))) return { ok: false, reason: "rate_limited" };

  let result;
  try {
    result = await getAuth().api.enableTwoFactor({
      body: { password: parsed.data.password, method: "totp" },
      headers: await headers(),
    });
  } catch (error) {
    return { ok: false, reason: authReason(error, "invalid_credentials") };
  }
  if (result.method !== "totp") throw new Error("enableTwoFactor returned no TOTP URI (spec 0008)");
  // Better Auth returns an `otpauth://` URI, not an image.
  const qrCode = await QRCode.toDataURL(result.totpURI, { margin: 1, width: 176 });
  const secret = new URL(result.totpURI).searchParams.get("secret") ?? "";
  return { ok: true, qrCode, secret, backupCodes: result.backupCodes };
}

// Step 2: a first code from the app turns 2FA on. Better Auth replaces the
// session here, and the new one counts as having passed the code.
export async function confirmTwoFactor(input: { code: string }): Promise<ActionResult> {
  const state = await securityState();
  const parsed = z.object({ code: sixDigits }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "otp_invalid" };
  if (!(await withinAuthLimits("confirmTwoFactor", "attempt", state.user.email))) return { ok: false, reason: "rate_limited" };

  try {
    await getAuth().api.verifyTOTP({ body: { code: parsed.data.code }, headers: await headers() });
  } catch (error) {
    return { ok: false, reason: authReason(error, "otp_invalid") };
  }
  reportEvent("auth.two_factor_enabled", { role: state.user.role });
  return { ok: true };
}

export async function regenerateBackupCodes(input: { password: string }): Promise<ActionResult<{ backupCodes: string[] }>> {
  const parsed = z.object({ password }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid_credentials" };
  const gate = await requireFreshTwoFactor();
  if (!gate.ok) return { ok: false, reason: "mfa_required" };

  try {
    const result = await getAuth().api.generateBackupCodes({
      body: { password: parsed.data.password },
      headers: await headers(),
    });
    return { ok: true, backupCodes: result.backupCodes };
  } catch (error) {
    return { ok: false, reason: authReason(error, "invalid_credentials") };
  }
}

export async function disableTwoFactor(input: { password: string }): Promise<ActionResult> {
  const parsed = z.object({ password }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid_credentials" };
  const gate = await requireFreshTwoFactor();
  if (!gate.ok) return { ok: false, reason: "mfa_required" };
  // Agents keep it on; only `mfa:reset` turns it off for them (AC-9, AC-14).
  if (gate.user.role === "AGENT") return { ok: false, reason: "agent_needs_2fa" };

  try {
    await getAuth().api.disableTwoFactor({ body: { password: parsed.data.password }, headers: await headers() });
  } catch (error) {
    return { ok: false, reason: authReason(error, "invalid_credentials") };
  }
  reportEvent("auth.two_factor_disabled", { role: gate.user.role });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Linked sign in methods (AC-10).

export async function linkGoogle(): Promise<ActionResult> {
  await signedInUser();
  let url: string | undefined;
  try {
    const result = await getAuth().api.linkSocialAccount({
      body: {
        provider: "google",
        callbackURL: routes.account,
        errorCallbackURL: `${routes.account}?error=linking_failed`,
        disableRedirect: true,
      },
      headers: await headers(),
    });
    url = result.url;
  } catch (error) {
    reportError("auth.link_start_failed", error, { code: authErrorCode(error) });
  }
  if (!url) return { ok: false, reason: "linking_unavailable" };
  redirect(url);
}

export async function unlinkMethod(input: { accountId: string }): Promise<ActionResult> {
  const state = await securityState();
  const parsed = z.object({ accountId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "linking_unavailable" };
  // With 2FA on, removing a way in needs a recent authenticator code.
  if (state.user.twoFactorEnabled && !state.twoFactorFresh) return { ok: false, reason: "mfa_required" };

  const accounts = await db.account.findMany({ where: { userId: state.user.id }, select: { id: true } });
  if (accounts.length < 2) return { ok: false, reason: "last_method" };
  if (!accounts.some((account) => account.id === parsed.data.accountId)) return { ok: false, reason: "linking_unavailable" };

  try {
    await getAuth().api.unlinkAccount({ body: { accountId: parsed.data.accountId }, headers: await headers() });
  } catch (error) {
    const reason = authReason(error, "linking_unavailable");
    if (reason === "linking_unavailable") reportError("auth.unlink_failed", error, { code: authErrorCode(error) });
    return { ok: false, reason: authErrorCode(error) === "FAILED_TO_UNLINK_LAST_ACCOUNT" ? "last_method" : reason };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Sign out everywhere (AC-15): every other session, then this one, so this
// device's cookie is cleared too.

export async function signOutEverywhere() {
  try {
    const api = getAuth().api;
    const requestHeaders = await headers();
    await api.revokeOtherSessions({ headers: requestHeaders });
    await api.signOut({ headers: requestHeaders });
  } catch (error) {
    reportError("auth.sign_out_everywhere_failed", error, { code: authErrorCode(error) });
  }
  redirect(routes.signIn);
}
