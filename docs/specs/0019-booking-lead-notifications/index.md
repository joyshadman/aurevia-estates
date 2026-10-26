# 0019 · Booking & lead notifications

**Status**: Assumed
**Date**: 2026-10-26
**Authorized by**: joyshadman, during /develop ("finish slice 3 with recommended decisions")

## Owed decision
Which emails go out on which events, to whom, what they say, and how a failed send is retried or logged. The mechanism is fixed by spec 0001 (*Background jobs*: `after()` plus Vercel Cron draining a database outbox; *Email*: Resend with React Email).

## Assumption built on
- **Three emails**, English only (Bangla site wide is deferred), times in `Asia/Dhaka`:
  | Kind | Trigger | To | Says |
  |---|---|---|---|
  | `viewing_requested` | `requestViewing` creates a new viewing (not `reused`) | the visitor's profile email | request received, home, requested time, "your advisor will confirm", link to `/account#viewings` |
  | `lead_new` | the same booking | the lead's assigned agent; when none, every active agent (`role AGENT`, not deleted) | new lead, home, visitor name, phone (and WhatsApp flag), requested time, link to `/dashboard/leads/<id>` |
  | `viewing_confirmed` | `transitionViewingIn` to `CONFIRMED` | the lead's visitor (skipped when the visitor is deleted) | confirmed, home, confirmed time, link to `/account#viewings` |
  Changes and cancels send nothing yet.
- **Outbox** `email_outbox` (new table): `id` uuid v7, `kind` text, `to_email`, `profile_id` (FK `profiles`, on delete set null; the visitor or agent it is for), `payload` jsonb (everything the template needs, so the send never re-reads), `status` `PENDING` | `SENT` | `FAILED`, `attempts` int, `next_attempt_at`, `last_error`, `sent_at`, `created_at`. Index on `(status, next_attempt_at)`.
- **Enqueue inside the writer's transaction**, so an email exists only if the booking or confirm committed. After the response, `after()` sends that transaction's rows at once. Resend `idempotencyKey` is `outbox/<id>`, so a retry never sends twice.
- **Retry**: a failed send sets `attempts + 1`, `last_error`, and `next_attempt_at` with backoff (5, 15, 60, 240 minutes). After 5 attempts the row is `FAILED` and `reportError("notify.send_failed_final")` goes to Sentry. Each send claims rows with `FOR UPDATE SKIP LOCKED`, so the cron and an `after()` never send the same row together.
- **Cron**: `GET /api/cron/outbox` checks `Authorization: Bearer <CRON_SECRET>`, sends up to 50 due rows, and deletes `SENT` rows older than 30 days (the payload is personal data). `vercel.json` runs it daily (Hobby allows only daily crons); on Pro change it to every 10 minutes (spec 0001 launch blocker).
- **Missing email setup**: with `RESEND_API_KEY` unset the row stays `PENDING` and the attempt is logged, never thrown into the booking.
- **From address**: `NOTIFY_EMAIL_FROM`, falling back to `AUTH_EMAIL_FROM`.

## Code area
`prisma/schema.prisma`, `prisma/migrations/*_email_outbox/`, `lib/server/notify.ts`, `lib/server/env.ts`, `emails/notify/`, `lib/server/bookings.ts`, `lib/server/viewing-status.ts`, `app/api/cron/outbox/route.ts`, `vercel.json`, `.env.example`

## Requirements
- **AC-1**: Booking a new viewing queues one `viewing_requested` to the visitor and one `lead_new` per recipient agent, in the booking's transaction; a double submit (reused) queues nothing.
- **AC-2**: An agent confirming a viewing queues one `viewing_confirmed` to the visitor.
- **AC-3**: Queued emails are sent right after the response; each row is sent at most once (idempotency key and row claim).
- **AC-4**: A failed send is retried with backoff by the cron; after 5 attempts it is marked `FAILED` and reported to Sentry. A booking never fails because an email failed.
- **AC-5**: The cron route refuses requests without the right `CRON_SECRET`.
- **AC-6**: Sent rows are deleted after 30 days; deleting an account deletes its pending rows (spec 0017).

## Ratify
This decision was recorded by /develop, not deliberated. Run `/architect booking & lead notifications` to deliberate and ratify it. Until then it stays flagged as an owed decision; it does not block marking the feature `done`.
