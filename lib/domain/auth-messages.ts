// Sign in messages (spec 0004, *Error messages*).
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
  mfa_required: "Enter a code from your authenticator app to continue.",
  reauth_required: "For your security, sign in again to set up an authenticator.",
  nonce_invalid: "That confirmation code didn't work.",
  last_factor: "Add another authenticator before removing this one.",
  last_method: "You need at least one way to sign in.",
  identity_already_exists: "That Google account is already linked to another Aurevia account.",
  linking_unavailable: "Linking isn't available right now.",
  invalid_phone: "Enter a valid phone number.",
  invalid_name: "Enter a name up to 80 characters.",
  name_taken: "You already have an authenticator with that name.",
  invalid_email: "Enter a valid email address.",
  signed_out: "Your session ended. Sign in again.",
  unknown: "Something went wrong. Please try again.",
} as const;

export type AuthReason = keyof typeof authMessages;
export type AuthFailure = { ok: false; reason: AuthReason; cooldownSeconds?: number };

export function authMessage(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return (authMessages as Record<string, string>)[reason] ?? authMessages.unknown;
}
