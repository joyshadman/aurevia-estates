// What the sign in UI says for each failure reason (spec 0004, *Error messages*,
// as changed by spec 0008). Shared by server actions (which return a reason) and
// the pages that show it. `nonce_invalid`, `last_factor`, and `name_taken` go
// when tasks 5 and 6 of spec 0008 rebuild the account pages.

export const authMessages = {
  otp_invalid: "That code didn't work. Check it or send a new one.",
  link_invalid: "That link has expired or was already used. Send yourself a new code.",
  captcha_failed: "Please try again.",
  rate_limited: "Please wait a moment before trying again.",
  email_send_failed: "We couldn't send the email. Try again in a minute.",
  email_not_confirmed: "Confirm your email first.",
  invalid_credentials: "Email or password is wrong.",
  weak_password: "Use at least 8 characters with a letter and a number.",
  google_cancelled: "Google sign in was cancelled.",
  google_unavailable: "Google sign in isn't available right now. Try email instead.",
  account_deleted: "This account has been deleted.",
  mfa_required: "Sign in again with your password and authenticator code.",
  agent_reauth: "For your security, agents sign in with a password and an authenticator code.",
  two_factor_expired: "That took too long. Sign in again.",
  agent_needs_2fa: "Agents must keep two step verification on.",
  too_many_attempts: "Too many wrong codes. Sign in again.",
  linking_failed: "We couldn't link that Google account. Try again.",
  reauth_required: "For your security, sign in again to set up an authenticator.",
  session_not_fresh: "For your security, sign in again, then try that within 15 minutes.",
  last_method: "You need at least one way to sign in.",
  identity_already_exists: "That Google account is already linked to another Aurevia account.",
  linking_unavailable: "Linking isn't available right now.",
  invalid_phone: "Enter a valid phone number.",
  invalid_name: "Enter a name up to 80 characters.",
  invalid_email: "Enter a valid email address.",
} as const;

export type AuthReason = keyof typeof authMessages;

// Reasons a page may show from its `?error=` query value; anything else is ignored.
export function authReasonFrom(value: unknown): AuthReason | null {
  return typeof value === "string" && Object.hasOwn(authMessages, value) ? (value as AuthReason) : null;
}

// Seconds between code emails to one address (spec 0008, AC-2).
export const codeCooldownSeconds = 60;
export const codeLength = 6;
