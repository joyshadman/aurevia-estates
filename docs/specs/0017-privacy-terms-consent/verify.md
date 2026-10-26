# Verify: Privacy, terms & cookie consent · spec 0017 · updated 2026-10-26
_Steps derived from spec 0017 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] Signed out, open `/privacy` and `/terms` → both render the text with "Last updated", and the footer shows Privacy, Terms, Cookie settings → AC-1
- [ ] In a fresh browser profile, open `/` → the Cookies card shows; the Network tab has no request to `posthog` or `i.posthog.com` → AC-2
- [ ] Click "Essential only", reload → no card, still no PostHog request; the `aurevia_consent=essential` cookie has Max-Age about 180 days → AC-2, AC-3
- [ ] Footer "Cookie settings" → card reopens with focus on its heading, shows "Now: essential only"; click "Allow analytics" → PostHog loads → AC-3
- [ ] With analytics on, reopen and pick "Essential only" → no further PostHog requests; its localStorage key is cleared → AC-3
- [ ] As a visitor with a chat, a saved home, and an active viewing, sign in fresh, open `/account` → "Delete account" → type the email → confirm → toast, lands on `/`, signed out → AC-4
- [ ] Sign in again with the same email → a new empty account (no chats, no saved homes, no viewings) → AC-4
- [ ] As the agent, open that lead → contact shows "Deleted user", no phone, no message; the viewing is Cancelled with "Visitor deleted their account"; the visitor's old note body is gone → AC-5
- [ ] As a visitor signed in more than 15 minutes ago, try to delete → "sign in again" alert with a Sign in again button → AC-6
- [ ] Type a different email → "Type your email address exactly as shown" → AC-6
- [ ] As an agent, `/account` → the Delete account panel shows the "removed by the agency owner" text, no button → AC-6

## Commands
- [ ] `npm run build` → `/privacy` and `/terms` are listed as prerendered (◐ or ○), not ƒ → AC-1
- [ ] After a deletion, in SQL: `select email, deleted_at from profiles where id = '<id>'` → `deleted+<id>@deleted.invalid` and a timestamp; `select count(*) from sessions where user_id = '<id>'` → 0 → AC-4

## Acceptance-criteria coverage
- AC-1: steps 1, cmd 1 · AC-2: steps 2, 3 · AC-3: steps 3, 4, 5 · AC-4: steps 6, 7, cmd 2 · AC-5: step 8 · AC-6: steps 9, 10, 11
