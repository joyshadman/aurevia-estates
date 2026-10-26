import "server-only";
import { after } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { NotifyEmail, type NotifyEmailProps } from "@/emails/notify/notify-email";
import { displayName } from "@/lib/domain/display-name";
import { formatViewingTime, viewingStart } from "@/lib/domain/viewing-slots";
import { publicEnv } from "@/lib/env";
import type { Prisma } from "@/lib/generated/prisma/client";
import { db } from "@/lib/server/db";
import { notifyEnv } from "@/lib/server/env";
import { reportError, reportEvent } from "@/lib/server/report";

// Booking and lead notifications through an outbox (spec 0019; spec 0001,
// *Background jobs*). Writers queue rows inside their own transaction, so an
// email exists only if the change committed. `after()` sends them once the
// response is out; the cron (`/api/cron/outbox`) retries what failed.

// AC-4: retry after 5, 15, 60, 240 minutes; the 5th failure is final.
const backoffMinutes = [5, 15, 60, 240];
export const maxAttempts = backoffMinutes.length + 1;
// A claimed row is left alone this long, so the cron and an `after()` never send it together.
const claimMinutes = 5;
// Prisma fills `next_attempt_at` from the app clock, which may run ahead of the
// database clock: a row this close to due counts as due. Far below the claim
// and the backoff, so it never lets a row be sent twice.
const clockSkewSeconds = 60;
const sentRetentionDays = 30;

const home = z.object({ title: z.string(), refCode: z.string(), area: z.string() });

const payloads = {
  viewing_requested: z.object({ name: z.string(), home, start: z.iso.datetime() }),
  viewing_confirmed: z.object({ name: z.string(), home, start: z.iso.datetime() }),
  lead_new: z.object({
    leadId: z.uuid(),
    name: z.string(),
    phone: z.string().nullable(),
    whatsapp: z.boolean().nullable(),
    note: z.string().nullable(),
    home,
    start: z.iso.datetime(),
  }),
};

type Kind = keyof typeof payloads;
type Payload<K extends Kind> = z.infer<(typeof payloads)[K]>;
type Queued = { [K in Kind]: { kind: K; toEmail: string; profileId: string; payload: Payload<K> } }[Kind];

const sylhet = (start: string) => `${formatViewingTime(start)} (Sylhet time)`;
const homeLine = (h: Payload<"lead_new">["home"]) => `${h.title}, ${h.area} (${h.refCode})`;
const siteLink = (path: string) => new URL(path, publicEnv().NEXT_PUBLIC_SITE_URL).toString();

// The words of each email (spec 0019, *Three emails*).
function render(kind: Kind, raw: unknown): { subject: string; props: NotifyEmailProps } {
  switch (kind) {
    case "viewing_requested": {
      const p = payloads.viewing_requested.parse(raw);
      return {
        subject: `Viewing request received: ${p.home.refCode}`,
        props: {
          heading: "We have your viewing request",
          intro: `Thanks, ${p.name}. Your advisor will confirm the time with you, usually within a working day.`,
          facts: [
            { label: "Home", value: homeLine(p.home) },
            { label: "Requested time", value: sylhet(p.start) },
          ],
          button: { label: "See your viewings", href: siteLink("/account#viewings") },
          footer: "You can change or cancel up to 2 hours before from your account.",
        },
      };
    }
    case "viewing_confirmed": {
      const p = payloads.viewing_confirmed.parse(raw);
      return {
        subject: `Viewing confirmed: ${p.home.refCode}`,
        props: {
          heading: "Your viewing is confirmed",
          intro: `Good news, ${p.name}. Your advisor will meet you at the home.`,
          facts: [
            { label: "Home", value: homeLine(p.home) },
            { label: "Time", value: sylhet(p.start) },
          ],
          button: { label: "See your viewings", href: siteLink("/account#viewings") },
          footer: "You can change or cancel up to 2 hours before from your account.",
        },
      };
    }
    case "lead_new": {
      const p = payloads.lead_new.parse(raw);
      const phone = p.phone ? `${p.phone}${p.whatsapp ? " (WhatsApp)" : ""}` : "Not given";
      return {
        subject: `New viewing request: ${p.home.refCode}`,
        props: {
          heading: "New viewing request",
          intro: `${p.name} asked to view a home through the Aurevia Assistant.`,
          facts: [
            { label: "Home", value: homeLine(p.home) },
            { label: "Requested time", value: sylhet(p.start) },
            { label: "Phone", value: phone },
            ...(p.note ? [{ label: "Note", value: p.note }] : []),
          ],
          button: { label: "Open the lead", href: siteLink(`/dashboard/leads/${p.leadId}`) },
          footer: "Confirm or suggest a new time from the lead page.",
        },
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Queueing (inside the writer's transaction).

async function queueIn(tx: Prisma.TransactionClient, rows: Queued[]) {
  if (rows.length === 0) return;
  const created = await tx.emailOutbox.createManyAndReturn({
    data: rows.map((row) => ({ ...row, payload: row.payload as Prisma.InputJsonValue })),
    select: { id: true },
  });
  sendSoon(created.map((row) => row.id));
}

// After the response (AC-3). Outside a request (a script), the cron sends them.
function sendSoon(ids: string[]) {
  try {
    after(() => sendDue({ ids }).catch((error: unknown) => reportError("notify.send_soon_failed", error)));
  } catch {
    // No request scope.
  }
}

const viewingContext = (tx: Prisma.TransactionClient, viewingId: string) =>
  tx.viewing.findUniqueOrThrow({
    where: { id: viewingId },
    select: {
      requestedFor: true,
      confirmedFor: true,
      lead: {
        select: {
          id: true,
          contactName: true,
          contactPhone: true,
          contactWhatsapp: true,
          message: true,
          assignedAgentId: true,
          visitor: { select: { id: true, email: true, fullName: true, deletedAt: true } },
          listing: { select: { title: true, refCode: true, area: { select: { nameEn: true } } } },
        },
      },
    },
  });

type ViewingContext = Awaited<ReturnType<typeof viewingContext>>;

const homeOf = (lead: ViewingContext["lead"]) => ({
  title: lead.listing?.title ?? "A home",
  refCode: lead.listing?.refCode ?? "",
  area: lead.listing?.area.nameEn ?? "Sylhet",
});

const liveVisitor = (lead: ViewingContext["lead"]) => (lead.visitor && !lead.visitor.deletedAt ? lead.visitor : null);

// AC-1: a new booking tells the visitor and the agent. The caller skips a reused booking.
export async function queueBookingEmailsIn(tx: Prisma.TransactionClient, viewingId: string) {
  const viewing = await viewingContext(tx, viewingId);
  const { lead } = viewing;
  const start = viewingStart(viewing).toISOString();
  const rows: Queued[] = [];

  const visitor = liveVisitor(lead);
  if (visitor) {
    rows.push({
      kind: "viewing_requested",
      toEmail: visitor.email,
      profileId: visitor.id,
      payload: { name: lead.contactName || displayName(visitor), home: homeOf(lead), start },
    });
  }

  // The assigned agent; with none, every active agent (spec 0019).
  const agents = await tx.profile.findMany({
    where: lead.assignedAgentId
      ? { id: lead.assignedAgentId, deletedAt: null }
      : { role: "AGENT", deletedAt: null },
    select: { id: true, email: true },
  });
  for (const agent of agents) {
    rows.push({
      kind: "lead_new",
      toEmail: agent.email,
      profileId: agent.id,
      payload: {
        leadId: lead.id,
        name: lead.contactName,
        phone: lead.contactPhone,
        whatsapp: lead.contactWhatsapp,
        note: lead.message,
        home: homeOf(lead),
        start,
      },
    });
  }
  await queueIn(tx, rows);
}

// AC-2: an agent confirmed the viewing.
export async function queueViewingConfirmedIn(tx: Prisma.TransactionClient, viewingId: string) {
  const viewing = await viewingContext(tx, viewingId);
  const visitor = liveVisitor(viewing.lead);
  if (!visitor) return;
  await queueIn(tx, [
    {
      kind: "viewing_confirmed",
      toEmail: visitor.email,
      profileId: visitor.id,
      payload: {
        name: viewing.lead.contactName || displayName(visitor),
        home: homeOf(viewing.lead),
        start: viewingStart(viewing).toISOString(),
      },
    },
  ]);
}

// ---------------------------------------------------------------------------
// Sending (after the response, and from the cron).

type Claimed = { id: string; kind: Kind; to_email: string; payload: unknown; attempts: number };

// Claims due rows by pushing `next_attempt_at` forward (SKIP LOCKED), then
// sends outside any transaction, so a slow send never holds a connection.
async function claimDue({ ids, limit }: { ids?: string[]; limit: number }): Promise<Claimed[]> {
  return db.$queryRaw<Claimed[]>`
    UPDATE email_outbox SET next_attempt_at = now() + make_interval(mins => ${claimMinutes})
    WHERE id IN (
      SELECT id FROM email_outbox
      WHERE status = 'PENDING' AND next_attempt_at <= now() + make_interval(secs => ${clockSkewSeconds})
        AND (${ids ?? null}::uuid[] IS NULL OR id = ANY(${ids ?? null}::uuid[]))
      ORDER BY next_attempt_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, kind, to_email, payload, attempts`;
}

export type SendSummary = { sent: number; failed: number; deferred: number };

export async function sendDue({ ids, limit = 50 }: { ids?: string[]; limit?: number } = {}): Promise<SendSummary> {
  const summary: SendSummary = { sent: 0, failed: 0, deferred: 0 };
  const rows = await claimDue({ ids, limit });
  if (rows.length === 0) return summary;

  const env = notifyEnv();
  if (!env) {
    // Email isn't set up here: leave the rows for the cron, no attempt counted.
    reportEvent("notify.email_not_configured", { rows: rows.length });
    summary.deferred = rows.length;
    return summary;
  }
  const resend = new Resend(env.apiKey);

  for (const row of rows) {
    try {
      const { subject, props } = render(row.kind, row.payload);
      const { error } = await resend.emails.send(
        { from: env.from, to: row.to_email, subject, react: NotifyEmail(props) },
        // Resend drops a repeat within 24 hours (AC-3).
        { idempotencyKey: `outbox/${row.id}` },
      );
      if (error) throw new Error(`${error.name}: ${error.message}`);
      await db.emailOutbox.update({ where: { id: row.id }, data: { status: "SENT", sentAt: new Date(), lastError: null } });
      summary.sent += 1;
    } catch (error) {
      await recordFailure(row, error);
      summary.failed += 1;
    }
  }
  return summary;
}

// AC-4: back off, and give up after the 5th failure.
async function recordFailure(row: Claimed, error: unknown) {
  const attempts = row.attempts + 1;
  const final = attempts >= maxAttempts;
  const lastError = (error instanceof Error ? error.message : String(error)).slice(0, 500);
  const nextAttemptAt = new Date(Date.now() + (backoffMinutes[attempts - 1] ?? 0) * 60_000);
  await db.emailOutbox.update({
    where: { id: row.id },
    data: { attempts, lastError, status: final ? "FAILED" : "PENDING", ...(final ? {} : { nextAttemptAt }) },
  });
  if (final) reportError("notify.send_failed_final", error, { outboxId: row.id, kind: row.kind, attempts });
  else reportEvent("notify.send_failed", { outboxId: row.id, kind: row.kind, attempts });
}

// AC-6: the payload is personal data; sent rows go after 30 days.
export async function purgeSent(now = new Date()) {
  const before = new Date(now.getTime() - sentRetentionDays * 24 * 60 * 60 * 1000);
  const { count } = await db.emailOutbox.deleteMany({ where: { status: "SENT", sentAt: { lt: before } } });
  return count;
}
