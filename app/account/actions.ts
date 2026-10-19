"use server";

import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { updateTag } from "next/cache";
import { z } from "zod";
import type { AuthFailure } from "@/lib/domain/auth-messages";
import { CODE_COOLDOWN_SECONDS, passwordRule, withinEnrollWindow } from "@/lib/domain/auth-rules";
import { getCurrentUser, mfaState, requireFreshMfa } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { authReason } from "@/lib/server/sign-in";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Account actions (spec 0004, AC-9, AC-10). Each reads the session itself; the
// role is never read or written here.

const fail = (reason: AuthFailure["reason"], extra: Partial<AuthFailure> = {}): AuthFailure => ({ ok: false, reason, ...extra });
type Ok<T = object> = { ok: true } & T;

// Name, phone (stored as E.164), and the WhatsApp tick (spec 0007, AC-11).
export async function updateProfileAction(input: { fullName: string; phone: string; countryCode: string; whatsapp: boolean }): Promise<Ok | AuthFailure> {
  const user = await getCurrentUser();
  if (!user) return fail("signed_out");
  const name = z.string().trim().min(1).max(80).safeParse(input.fullName);
  if (!name.success) return fail("invalid_name");
  let phone: string | null = null;
  if (String(input.phone ?? "").trim()) {
    const parsed = parsePhoneNumberFromString(String(input.phone), String(input.countryCode ?? "BD").toUpperCase() as CountryCode);
    if (!parsed?.isValid()) return fail("invalid_phone");
    phone = parsed.number;
  }
  await db.profile.update({
    where: { id: user.id },
    data: { fullName: name.data, phone, phoneIsWhatsapp: Boolean(input.whatsapp) },
  });
  // An agent's name shows on property pages' advisor cards (spec 0009, AC-7).
  if (user.role === "AGENT") updateTag("listings");
  return { ok: true };
}

// Emails a confirmation code; it is entered with the new password (AC-10).
export async function requestReauthAction(): Promise<Ok<{ cooldownSeconds: number }> | AuthFailure> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.reauthenticate();
  if (error) return fail(authReason(error), { cooldownSeconds: CODE_COOLDOWN_SECONDS });
  return { ok: true, cooldownSeconds: CODE_COOLDOWN_SECONDS };
}

export async function changePasswordAction(input: { password: string; nonce: string }): Promise<Ok | AuthFailure> {
  const user = await getCurrentUser();
  if (!user) return fail("signed_out");
  const password = passwordRule.safeParse(input.password);
  if (!password.success) return fail("weak_password");
  const nonce = z.string().trim().regex(/^\d{6}$/).safeParse(input.nonce);
  if (!nonce.success) return fail("nonce_invalid");
  // With an authenticator, a fresh code is needed too.
  const mfa = await mfaState();
  if (mfa.verified.length > 0) {
    const fresh = await requireFreshMfa();
    if ("ok" in fresh) return fail("mfa_required");
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: password.data, nonce: nonce.data });
  if (error) return fail(authReason(error, "nonce_invalid"));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Authenticators (AC-9).

export async function enrollFactorAction(input: { friendlyName: string }): Promise<Ok<{ factorId: string; qrCode: string; secret: string }> | AuthFailure> {
  const user = await getCurrentUser();
  if (!user) return fail("signed_out");
  const name = z.string().trim().min(1).max(40).safeParse(input.friendlyName);
  if (!name.success) return fail("invalid_name");
  const mfa = await mfaState();
  const now = Date.now();
  // A second factor needs a fresh code; an agent's first one needs a recent sign in.
  if (mfa.verified.length > 0) {
    const fresh = await requireFreshMfa();
    if ("ok" in fresh) return fail("mfa_required");
  } else if (user.role === "AGENT" && !withinEnrollWindow(mfa.amr, now)) {
    return fail("reauth_required");
  }
  if (mfa.all.some((f) => f.friendly_name === name.data)) return fail("name_taken");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: name.data, issuer: "Aurevia Estates" });
  if (error || !data) return fail(authReason(error));
  return { ok: true, factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export async function verifyFactorAction(input: { factorId: string; code: string }): Promise<Ok | AuthFailure> {
  const parsed = z.object({ factorId: z.uuid(), code: z.string().trim().regex(/^\d{6}$/) }).safeParse(input);
  if (!parsed.success) return fail("otp_invalid");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify(parsed.data);
  if (error) return fail(authReason(error, "otp_invalid"));
  return { ok: true };
}

export async function removeFactorAction(input: { factorId: string }): Promise<Ok | AuthFailure> {
  const user = await getCurrentUser();
  if (!user) return fail("signed_out");
  const fresh = await requireFreshMfa();
  if ("ok" in fresh) return fail("mfa_required");
  const mfa = await mfaState();
  const target = mfa.verified.find((f) => f.id === input.factorId);
  // An agent keeps at least one authenticator.
  if (user.role === "AGENT" && target && mfa.verified.length <= 1) return fail("last_factor");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.mfa.unenroll({ factorId: String(input.factorId) });
  if (error) return fail(authReason(error));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Linked sign in methods (AC-10). Linking Google arrives with the Google keys.

export async function unlinkIdentityAction(input: { identityId: string }): Promise<Ok | AuthFailure> {
  const user = await getCurrentUser();
  if (!user) return fail("signed_out");
  const mfa = await mfaState();
  if (mfa.verified.length > 0) {
    const fresh = await requireFreshMfa();
    if ("ok" in fresh) return fail("mfa_required");
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUserIdentities();
  const identities = data?.identities ?? [];
  if (identities.length <= 1) return fail("last_method");
  const identity = identities.find((i) => i.identity_id === input.identityId);
  if (!identity) return fail("unknown");
  const { error } = await supabase.auth.unlinkIdentity(identity);
  if (error) return fail(authReason(error));
  return { ok: true };
}
