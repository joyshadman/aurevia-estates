// What the lead pages say for each failure reason (spec 0009, *Error messages*).
// Shared by the actions (which return a reason) and the client forms.

export const leadMessages = {
  stale_status: "This lead just changed. Refresh to see it.",
  lead_closed: "This lead is closed. You can only close or cancel its viewings.",
  time_in_past: "Pick a time in the future.",
  unchanged: "That's already the confirmed time.",
  too_early: "You can mark this once the viewing time has passed.",
  invalid_move: "That move isn't allowed from the lead's current status.",
  not_an_agent: "Pick an agent from the list.",
  not_found: "We couldn't find this lead.",
  invalid: "Check the highlighted field.",
  // Spec 0008's words, as on the listing pages.
  signed_out: "Your session ended. Sign in again to continue.",
  mfa_required: "Enter a code from your authenticator app to continue.",
} as const;

export type LeadMessageReason = keyof typeof leadMessages;

// `invalid`, per field.
export const fieldMessages = {
  reason: "Give a reason of 1 to 200 characters.",
  note: "Write a note of 1 to 2,000 characters.",
  time: "Pick a date within 30 days and a time.",
} as const;
