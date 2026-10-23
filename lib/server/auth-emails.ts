import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { after } from "next/server";
import { Resend } from "resend";
import { AuthCodeEmail, authEmailSubject, type AuthEmailKind } from "@/emails/auth/auth-code-email";
import { publicEnv } from "@/lib/env";
import { authError } from "@/lib/server/auth-errors";
import { authRequest } from "@/lib/server/auth-request";
import { db } from "@/lib/server/db";
import { authEnv } from "@/lib/server/env";
import { reportError } from "@/lib/server/report";

// Better Auth's email callback (spec 0008, *Email codes and links*, AC-13):
// our React Email templates, sent through Resend.

export type OtpType = "sign-in" | "email-verification" | "forget-password" | "change-email";

// The `type` the `/auth/confirm` link carries for each code.
const linkType = { "sign-in": "sign-in", "email-verification": "verify", "forget-password": "reset" } as const;

function confirmLink(type: keyof typeof linkType, email: string, code: string, next: string | null) {
  const link = new URL("/auth/confirm", publicEnv().NEXT_PUBLIC_SITE_URL);
  link.searchParams.set("type", linkType[type]);
  link.searchParams.set("email", email);
  link.searchParams.set("code", code);
  // A reset link sets the new password on `/auth/confirm` itself, then lands by role.
  if (next && type !== "forget-password") link.searchParams.set("next", next);
  return link.toString();
}

// A password set on a never verified email may belong to someone who
// pre registered the address. Replace it before the real owner gets a code
// (AC-13), so it never works again.
export async function replaceUnprovenPassword(userId: string) {
  const password = await hashPassword(randomBytes(32).toString("base64url"));
  await db.account.updateMany({ where: { userId, providerId: "credential" }, data: { password } });
}

export async function sendVerificationOTP({ email, otp, type }: { email: string; otp: string; type: OtpType }) {
  if (type === "change-email") throw new Error("Email change is not enabled (spec 0008)");
  // Read before any `after()` work begins, so a background send keeps it.
  const { next, awaitResetEmail } = authRequest();

  const profile = await db.profile.findUnique({
    where: { email },
    select: { id: true, emailVerified: true, accounts: { where: { providerId: "credential" }, select: { id: true } } },
  });
  // A reset for an account with no password yet is "set a first password" (AC-10).
  const kind: AuthEmailKind =
    type === "sign-in"
      ? "signin"
      : type === "email-verification"
        ? "signup"
        : profile && profile.accounts.length === 0
          ? "set-password"
          : "recovery";
  // The sign in and set a first password emails are awaited, so a failed send
  // fails the request. Sign up and reset go out after the response, so an
  // existing account takes no longer than an unknown one (AC-13).
  const awaited = type === "sign-in" || (type === "forget-password" && awaitResetEmail);

  // The 60 second cooldown is claimed by the action before it calls Better Auth
  // (`claimEmailCooldown`): by the time this runs, a new code has already
  // replaced the one in the user's inbox.

  if (type === "sign-in" && profile && !profile.emailVerified && profile.accounts.length > 0) {
    await replaceUnprovenPassword(profile.id);
  }

  const env = authEnv();
  const send = () =>
    new Resend(env.RESEND_API_KEY).emails.send(
      {
        from: env.AUTH_EMAIL_FROM,
        to: email,
        subject: authEmailSubject(kind),
        react: AuthCodeEmail({ kind, code: otp, link: confirmLink(type, email, otp, next), locale: "en" }),
      },
      { idempotencyKey: `auth/${type}/${createHash("sha256").update(`${email}:${otp}`).digest("hex")}` },
    );

  if (awaited) {
    const { error } = await send();
    if (error) {
      reportError("auth.email_send_failed", error, { type });
      throw authError("EMAIL_SEND_FAILED");
    }
    return;
  }

  after(async () => {
    try {
      const { error } = await send();
      if (error) reportError("auth.email_send_failed", error, { type });
    } catch (error) {
      reportError("auth.email_send_failed", error, { type });
    }
  });
}
