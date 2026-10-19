import { createUIMessageStreamResponse } from "ai";
import { after } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth";
import { maxMessageLength, runAssistantTurn } from "@/lib/server/assistant/turn";
import { reportError } from "@/lib/server/report";

// The streaming chat turn (spec 0006, *The chat turn*). Only the new message is
// sent; history comes from the database. The reply is saved by the server
// reading its own copy of the stream inside `after()`, so closing the tab never
// loses it (AC-2).

export const maxDuration = 60;

const body = z.object({
  conversationId: z.uuid().optional(),
  // Only plain text from the browser: no tool, data, or system parts.
  message: z.object({
    id: z.string().min(1).max(100),
    role: z.literal("user"),
    parts: z.array(z.object({ type: z.literal("text"), text: z.string().max(maxMessageLength * 2) })).min(1).max(4),
  }),
  locale: z.enum(["en", "bn"]),
  trigger: z.enum(["submit-message", "regenerate-message"]),
  regenerateMessageId: z.string().min(1).max(100).optional(),
  startListingSlug: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ reason: "signed_out" }, { status: 401 });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ reason: "invalid" }, { status: 400 });

  const turn = await runAssistantTurn({ user, ...parsed.data });
  if (!turn.ok) {
    const { status, ...refusal } = turn;
    return Response.json(refusal, { status });
  }

  // One branch to the browser, one drained here so `done` (the save) always settles.
  const [toClient, toServer] = turn.stream.tee();
  after(async () => {
    try {
      const reader = toServer.getReader();
      while (!(await reader.read()).done) {
        // Drain.
      }
      await turn.done;
    } catch (error) {
      reportError(error, { where: "api.chat.after", conversationId: turn.conversationId });
    }
  });

  return createUIMessageStreamResponse({ stream: toClient });
}
