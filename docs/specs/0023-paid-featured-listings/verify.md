# Verify: Paid featured listings (placeholder) · spec 0023 · updated 2026-10-26
_Steps derived from spec 0023 acceptance criteria. This covers only the preview page; real payments are not built._

## UI / manual
- [ ] As an agent, "Featured" in the dashboard nav → the page with the Preview badge, a listing picker of your published homes, and 7, 14, 30 days each saying "Price to be announced" → AC-1
- [ ] "Pay and feature" is disabled; with the Network tab open, picking listings and periods sends no requests → AC-2
- [ ] An agent with no published listings → "No published listings yet" → AC-1

## Commands
- [x] Signed out `GET /dashboard/featured` → 307 to sign in (run by /develop) → AC-3
- [ ] As a visitor, `/dashboard/featured` → the dashboard 404 → AC-3

## Acceptance-criteria coverage
- AC-1: UI 1, 3 · AC-2: UI 2 · AC-3: cmds 1, 2
