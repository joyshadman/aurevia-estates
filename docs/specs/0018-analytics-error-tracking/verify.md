# Verify: Analytics & error tracking · spec 0018 · updated 2026-10-26
_Steps derived from spec 0018 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] Set `NEXT_PUBLIC_POSTHOG_KEY`, allow analytics, start a new chat from a listing page → one `chat_started` event with `from_listing: true` in PostHog Live events → AC-1
- [ ] Ask for homes → one `listing_recommended` per reply with `count` and `ref_codes` (AUR codes only) → AC-1
- [ ] Book a viewing → one `viewing_booked` with `ref_code`; double click Confirm → still one event → AC-1
- [ ] Inspect each event's properties → no email, name, phone, chat text, or person profile → AC-1
- [ ] With "Essential only", repeat the chat and booking → no PostHog requests at all → AC-2
- [ ] As an agent, `/dashboard/leads` → "Booked through the assistant: N viewings in the last 30 days"; book one more from chat and reload → N + 1 → AC-3

## Commands
- [ ] `select count(*) from viewings where conversation_id is not null and created_at >= now() - interval '30 days'` → equals the number on `/dashboard/leads` → AC-3
- [ ] With `SENTRY_DSN` set, throw in a page (temporary) → the Sentry issue has `environment` = `VERCEL_ENV` (or `development`) and no user info → AC-4
- [ ] On Vercel with `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` set, a build uploads source maps; the issue's stack shows source lines → AC-4

## Acceptance-criteria coverage
- AC-1: steps 1 to 4 · AC-2: step 5 · AC-3: step 6, cmd 1 · AC-4: cmds 2, 3
