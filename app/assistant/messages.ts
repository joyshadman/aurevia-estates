// What the chat says for each refusal reason the turn returns (spec 0006,
// *Rendering*: the client reads `reason` from the 4xx body).

export const chatErrorMessages = {
  signed_out: "Your session ended. Sign in again to keep chatting.",
  not_found: "We couldn't find this conversation.",
  turn_in_progress: "The assistant is still answering. Wait for the reply, then send again.",
  duplicate_message: "That message was already sent.",
  not_retryable: "That reply can't be retried.",
  daily_limit: "You've reached today's 40 messages. You can chat again after midnight, Bangladesh time.",
  invalid: "Messages are 1 to 2,000 characters.",
  failed: "The assistant could not answer just now. Try again in a moment.",
} as const;

export type ChatErrorReason = keyof typeof chatErrorMessages;

// The conversation list, brief pane, and Show more (spec 0006, AC-11, AC-12).
export const chatEditMessages = {
  signed_out: "Your session ended. Sign in again to keep chatting.",
  not_found: "We couldn't find this conversation.",
  invalid: "That change couldn't be saved. Reload the page and try again.",
  turn_in_progress: "The assistant is still answering. Wait for the reply, then try again.",
} as const;

export type ChatEditReason = keyof typeof chatEditMessages;

export const conversationTitleMessage = "Enter a title, 1 to 60 characters.";

// What the booking card, the confirmation card, and `/account` say for each
// booking reason (spec 0007, *Error messages*). English in every chat.
export const bookingErrorMessages = {
  signed_out: "Please sign in again to book a viewing.",
  not_found: "We couldn't find this viewing.",
  not_visitor: "Only buyers can book viewings from the assistant.",
  turn_in_progress: "One moment, the assistant is still replying.",
  slot_unavailable: "That time is no longer available. Please pick another.",
  listing_unavailable: "This home can't be booked right now.",
  already_booked: "You already have a viewing for this home.",
  too_many_viewings: "You have 5 upcoming viewings. Cancel one to book another.",
  too_many_changes: "This viewing has been changed 3 times. Please contact your advisor to change it again.",
  unchanged: "That's already your viewing time.",
  lead_closed: "This enquiry is closed. Please book a new viewing.",
  too_late: "It's less than 2 hours to your viewing. Call or WhatsApp your advisor to change it.",
  stale_status: "This viewing just changed. Refresh to see it.",
  invalid: "Please check the form.",
} as const;

export type BookingErrorReason = keyof typeof bookingErrorMessages;

export const bookingFieldMessages = {
  name: "Enter your name, 1 to 80 characters.",
  phone: "Enter a valid phone number for the chosen country.",
  note: "Keep the note under 500 characters.",
  reason: "Keep the reason under 200 characters.",
  start: "Pick a time.",
} as const;

export type BookingField = keyof typeof bookingFieldMessages;

// The chat hook's error message is the response body: `{ reason, ... }` as JSON.
export function chatErrorReason(error: Error | undefined): ChatErrorReason | null {
  if (!error) return null;
  try {
    const reason = (JSON.parse(error.message) as { reason?: unknown }).reason;
    if (typeof reason === "string" && Object.hasOwn(chatErrorMessages, reason)) return reason as ChatErrorReason;
  } catch {
    // Not a refusal body: a network or stream failure.
  }
  return "failed";
}
