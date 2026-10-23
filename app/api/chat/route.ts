import { consumeStream, createUIMessageStreamResponse } from "ai";
import { after } from "next/server";
import { z } from "zod";
import { runAssistantTurn, turnInput } from "@/lib/server/assistant/turn";
import { getCurrentUser } from "@/lib/server/auth";
import { TurnRefusedError } from "@/lib/server/errors";

// The streaming chat turn (spec 0006, *The chat turn*). Only the new message
// comes from the client; history comes from the database.

// Hobby's limit (spec 0001); the model call itself aborts at 55 seconds.
export const maxDuration = 60;

const requestBody = turnInput.extend({
  trigger: z.enum(["submit-message", "regenerate-message"]),
  regenerateMessageId: z.string().max(100).optional(),
});

const refused = (status: number, reason: string, details: Record<string, unknown> = {}) =>
  Response.json({ reason, ...details }, { status });

export async function POST(request: Request) {
  const user = await getCurrentUser({ refresh: true });
  if (!user) return refused(401, "signed_out");

  const parsed = requestBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return refused(400, "invalid");
  const { trigger, regenerateMessageId, conversationId, message, locale, startListingSlug } = parsed.data;

  let turn;
  try {
    turn = await runAssistantTurn({
      conversationId,
      message,
      locale,
      startListingSlug,
      trigger,
      regenerateMessageId,
      user: { id: user.id, role: user.role },
    });
  } catch (error) {
    if (error instanceof TurnRefusedError) return refused(error.status, error.reason, error.details);
    throw error;
  }

  // The save runs when the stream ends. Keep the function alive until it does,
  // even if the visitor closes the tab (AC-2); a failed save is already reported.
  after(() => turn.saved.catch(() => undefined));

  return createUIMessageStreamResponse({
    stream: turn.stream,
    // A server side copy is read to the end, so the turn finishes and saves
    // whether or not the browser is still listening.
    consumeSseStream: ({ stream }) => consumeStream({ stream }),
  });
}
