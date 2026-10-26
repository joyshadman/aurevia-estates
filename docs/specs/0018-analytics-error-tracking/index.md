# 0018 · Analytics & error tracking

**Status**: Assumed
**Date**: 2026-10-26
**Authorized by**: joyshadman, during /develop ("finish slice 3 with recommended decisions")

## Owed decision
Which funnel events are recorded, where they fire, what they carry, how bookings through the assistant are counted, and what "production errors are reported" adds on top of the minimal Sentry setup. The vendors are already fixed by spec 0001 (PostHog cloud after consent, Sentry).

## Assumption built on
- **PostHog, browser only** (`posthog-js`), loaded with a dynamic import only when the consent cookie says `analytics` (spec 0017). Config: `person_profiles: "identified_only"` and we never call `identify`, so no person profiles and no email or name ever reach PostHog; `capture_pageview: "history_change"`; `autocapture: false`; `disable_session_recording: true`; `persistence: "localStorage+cookie"`. Revoking consent calls `opt_out_capturing()` and `reset()`. With `NEXT_PUBLIC_POSTHOG_KEY` unset, analytics is off entirely. Host from `NEXT_PUBLIC_POSTHOG_HOST` (default `https://us.i.posthog.com`).
- **Funnel events** (the only custom events), fired from the client where the moment happens:
  | Event | When | Properties |
  |---|---|---|
  | `chat_started` | the visitor sends the first message of a new conversation | `from_listing` (bool: started from a listing page) |
  | `listing_recommended` | an assistant reply finishes with listing cards in it, once per reply | `count`, `ref_codes` (public listing codes only) |
  | `viewing_booked` | `requestViewing` returns ok and not `reused` | `ref_code` |
  No chat text, names, phones, emails, or ids of people in any event. Events go through one helper, `track()`, which does nothing without consent.
- **Counting bookings through the assistant** comes from the database, not PostHog, so it is exact and needs no consent: viewings with `conversation_id` set (spec 0007, *Value sourcing*), created in the window, any status. `countAssistantBookings(since)` in `lib/server/metrics.ts`; `/dashboard/leads` shows "Booked through the assistant: N in the last 30 days" above the inbox.
- **Errors**: Sentry already reports server, action, route handler, and browser errors (spec 0004). This adds `app/global-error.tsx` (reports React render errors in the root layout), the `environment` from `VERCEL_ENV`, and `withSentryConfig` in `next.config.ts` for source map upload when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` are set (skipped silently otherwise). Still no tracing, no replay, no user info.

## Code area
`lib/analytics.ts`, `components/chrome/analytics.tsx`, `app/assistant/chat-view.tsx`, `app/assistant/booking-cards.tsx`, `lib/server/metrics.ts`, `app/dashboard/leads/page.tsx`, `app/global-error.tsx`, `sentry.server.config.ts`, `instrumentation-client.ts`, `next.config.ts`, `lib/env.ts`

## Requirements
- **AC-1**: With consent, starting a chat, getting listing cards, and booking a viewing each send exactly one PostHog event with the properties above and no personal data.
- **AC-2**: Without consent (or after revoking it), no PostHog script loads and no event is sent.
- **AC-3**: `/dashboard/leads` shows the count of viewings booked through the assistant in the last 30 days, from `viewings.conversation_id`.
- **AC-4**: A thrown error in a page, action, route handler, the root layout, or the browser reaches Sentry with the environment set and no user info; source maps upload when the Sentry build variables are set.

## Ratify
This decision was recorded by /develop, not deliberated. Run `/architect analytics & error tracking` to deliberate and ratify it. Until then it stays flagged as an owed decision; it does not block marking the feature `done`.
