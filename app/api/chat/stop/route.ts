import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

// Stop (spec 0006, AC-10): marks the conversation; the running turn sees it
// within about a second and ends the model call. Owner only; anything else 404.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ reason: "signed_out" }, { status: 401 });
  const parsed = z.object({ conversationId: z.uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ reason: "not_found" }, { status: 404 });

  const updated = await db.$executeRaw`
    UPDATE conversations SET stop_requested_at = now()
    WHERE id = ${parsed.data.conversationId}::uuid AND user_id = ${user.id}::uuid`;
  if (updated === 0) return Response.json({ reason: "not_found" }, { status: 404 });
  return new Response(null, { status: 204 });
}
