import { timingSafeEqual } from "node:crypto";
import { cronSecret } from "@/lib/server/env";
import { purgeSent, sendDue } from "@/lib/server/notify";
import { reportError } from "@/lib/server/report";

// Vercel Cron drains the email outbox (spec 0019; spec 0001, *Background
// jobs*): retries what failed after the response, then purges old sent rows.

export const maxDuration = 60;

// AC-5: only a request carrying `Bearer <CRON_SECRET>` runs.
function authorized(request: Request) {
  const secret = cronSecret();
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ reason: "unauthorized" }, { status: 401 });
  try {
    const summary = await sendDue({ limit: 50 });
    const purged = await purgeSent();
    return Response.json({ ok: true, ...summary, purged });
  } catch (error) {
    reportError("notify.cron_failed", error);
    return Response.json({ reason: "failed" }, { status: 500 });
  }
}
