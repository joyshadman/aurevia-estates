# Verify: Agent dashboard overview · spec 0022 · updated 2026-10-26
_Steps derived from spec 0022 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. Steps marked "(run by /develop)" passed on 2026-10-26; the signed in page itself has not been opened yet (no agent account has 2FA set up on the dev database)._

## UI / manual
- [ ] Sign in as an agent (password and authenticator) → you land on `/dashboard`, "Overview" is highlighted, Properties and Leads are not → AC-1
- [ ] As a visitor, open `/dashboard` → the dashboard 404 → AC-1
- [ ] With leads, check the three tiles, the 8 weekly bars (hover shows "date: N leads"), the pipeline, and the 5 upcoming viewings with Sylhet times → AC-2 to AC-4
- [ ] As an agent with no leads → each card shows its empty state → AC-5

## Commands
- [x] Signed out `GET /dashboard` → 307 to `/sign-in?next=%2Fdashboard` (run by /develop) → AC-1
- [x] Seed leads 1, 2, 6, 9, 12, 20, 40 days old → weeks `0 0 1 0 0 1 2 3`, pipeline total 6 (the 40 day lead left out), each status counted (run by /develop) → AC-2, AC-3
- [x] Six future viewings and one past → exactly 5, soonest first, past one excluded (run by /develop) → AC-4
- [x] Every `app/dashboard/**/page.tsx` imports `requireAgent` (run by /develop) → AC-1

## Acceptance-criteria coverage
- AC-1: UI 1, 2, cmds 1, 4 · AC-2: UI 3, cmd 2 · AC-3: UI 3, cmd 2 · AC-4: UI 3, cmd 3 · AC-5: UI 4
