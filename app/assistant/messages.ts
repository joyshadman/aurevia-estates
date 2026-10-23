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
