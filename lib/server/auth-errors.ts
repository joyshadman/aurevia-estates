import "server-only";
import { APIError } from "better-auth/api";
import type { AuthReason } from "@/lib/auth/messages";

// Better Auth error codes to the reasons our pages show (spec 0008, *API
// surface*). One table, so every action maps the same code the same way.
const reasonByCode: Record<string, AuthReason> = {
  INVALID_OTP: "otp_invalid",
  OTP_EXPIRED: "otp_invalid",
  TOO_MANY_ATTEMPTS: "otp_invalid",
  INVALID_EMAIL_OR_PASSWORD: "invalid_credentials",
  INVALID_PASSWORD: "invalid_credentials",
  EMAIL_NOT_VERIFIED: "email_not_confirmed",
  PASSWORD_TOO_SHORT: "weak_password",
  PASSWORD_TOO_LONG: "weak_password",
  INVALID_EMAIL: "invalid_email",
  // The twoFactor plugin (AC-8, AC-9).
  INVALID_CODE: "otp_invalid",
  INVALID_BACKUP_CODE: "otp_invalid",
  INVALID_TWO_FACTOR_COOKIE: "two_factor_expired",
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "too_many_attempts",
  ACCOUNT_TEMPORARILY_LOCKED: "too_many_attempts",
  // `unlinkAccount` wants a session made in the last 15 minutes (`freshAge`).
  SESSION_NOT_FRESH: "session_not_fresh",
  // Thrown by our own hooks and email callback.
  ACCOUNT_DELETED: "account_deleted",
  RATE_LIMITED: "rate_limited",
  EMAIL_SEND_FAILED: "email_send_failed",
};

// Our own codes, thrown from hooks and the email callback.
export type AuthErrorCode = "ACCOUNT_DELETED" | "RATE_LIMITED" | "EMAIL_SEND_FAILED";

const statusByCode = {
  ACCOUNT_DELETED: "FORBIDDEN",
  RATE_LIMITED: "TOO_MANY_REQUESTS",
  EMAIL_SEND_FAILED: "INTERNAL_SERVER_ERROR",
} as const satisfies Record<AuthErrorCode, ConstructorParameters<typeof APIError>[0]>;

export function authError(code: AuthErrorCode, message: string = code) {
  return new APIError(statusByCode[code], { code, message });
}

export function authErrorCode(error: unknown): string | null {
  if (!(error instanceof APIError)) return null;
  const code = (error.body as { code?: unknown } | undefined)?.code;
  return typeof code === "string" ? code : null;
}

// The reason for a failed `auth.api.*` call. Unknown errors are not swallowed:
// they rethrow, so Sentry sees them through `onRequestError`.
export function authReason(error: unknown, fallback: AuthReason): AuthReason {
  if (!(error instanceof APIError)) throw error;
  const code = authErrorCode(error);
  if (code && Object.hasOwn(reasonByCode, code)) return reasonByCode[code];
  if (error.status === "TOO_MANY_REQUESTS") return "rate_limited";
  return fallback;
}
