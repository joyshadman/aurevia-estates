import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

// Stop (spec 0006, *Routes and pages*, AC-10): marks the conversation so its
// running reply ends within about a second (the turn checks once a second) and
// is saved as it stands. Owner only; anything else is a 404.
export async function POST(request: Request) {
  const user = await getCurrentUser({ refresh: true });
  if (!user) return Response.json({ reason: "signed_out" }, { status: 401 });

  const parsed = z.object({ conversationId: z.uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ reason: "not_found" }, { status: 404 });

  const updated = await db.$executeRaw`
    UPDATE conversations SET stop_requested_at = now()
    WHERE id = ${parsed.data.conversationId}::uuid AND user_id = ${user.id}::uuid`;
  if (updated === 0) return Response.json({ reason: "not_found" }, { status: 404 });
  return new Response(null, { status: 204 });
}
