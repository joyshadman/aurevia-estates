// What the fact sheet page says for each failure reason (spec 0006, AC-14).
// Shared by the actions (which return a reason) and the client editor.

export const factSheetMessages = {
  invalid: "The fact sheet needs 1 to 4,000 characters.",
  stale: "Another agent saved the fact sheet since you opened it. Reload to see their version.",
  not_found: "That version no longer exists. Reload the page.",
  signed_out: "Your session ended. Sign in again to continue.",
  mfa_required: "Enter a code from your authenticator app to continue.",
} as const;

export type FactSheetMessageReason = keyof typeof factSheetMessages;
