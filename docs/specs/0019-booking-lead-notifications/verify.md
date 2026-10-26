# Verify: Booking & lead notifications · spec 0019 · updated 2026-10-26
_Steps derived from spec 0019 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] With a verified Resend sender in `AUTH_EMAIL_FROM` (or `NOTIFY_EMAIL_FROM`), book a viewing from chat → the visitor gets "We have your viewing request" with the home and the Sylhet time; the assigned agent gets "New viewing request" with phone and a lead link → AC-1, AC-3
- [ ] Double click Confirm on the booking card → still one email each → AC-1, AC-3
- [ ] As the agent, confirm the viewing → the visitor gets "Your viewing is confirmed" with the confirmed time → AC-2
- [ ] Book a listing with no assigned agent → every active agent gets the alert → AC-1

## Commands
- [ ] After a booking: `select kind, status, attempts from email_outbox order by created_at desc limit 3` → `viewing_requested` and `lead_new`, `SENT` → AC-1, AC-3
- [ ] Set `AUTH_EMAIL_FROM` to an unverified domain, book → rows stay `PENDING` with `attempts` 1, `last_error` set, `next_attempt_at` about 5 minutes ahead; the booking itself succeeded → AC-4
- [ ] `update email_outbox set attempts = 4, next_attempt_at = now() where id = '<id>'`, then `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/outbox` → row `FAILED`, a `notify.send_failed_final` issue in Sentry → AC-4
- [ ] `curl localhost:3000/api/cron/outbox` with no header or a wrong secret → 401 → AC-5
- [ ] Set a `SENT` row's `sent_at` to 31 days ago, call the cron → the row is gone (`purged` 1) → AC-6
- [ ] Delete a visitor account with a `PENDING` row → the row is gone → AC-6

## Acceptance-criteria coverage
- AC-1: steps 1, 2, 4, cmd 1 · AC-2: step 3 · AC-3: steps 1, 2, cmd 1 · AC-4: cmds 2, 3 · AC-5: cmd 4 · AC-6: cmds 5, 6
