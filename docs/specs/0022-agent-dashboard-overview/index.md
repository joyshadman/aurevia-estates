# 0022 · Agent dashboard overview

**Status**: Assumed
**Date**: 2026-10-26
**Authorized by**: joyshadman, during /develop ("architect with recommended")

## Owed decision
What "weekly leads", "the 30 day pipeline", and "upcoming viewings" count, whose leads they cover, and where agents land on sign in.

## Assumption built on
- **Page**: `/dashboard`, the "Overview" item in the dashboard nav. Agents now land here on sign in (`defaultLanding`), replacing `/dashboard/leads` from spec 0004 AC-12.
- **Whose data**: leads assigned to the signed in agent (the inbox's default "mine" view, spec 0009).
- **Weekly leads**: leads created in the last 7 days, with the 7 days before for comparison, plus a bar per week for the last 8 weeks. Weeks are rolling 7 day windows ending now, counted from `leads.created_at`.
- **30 day pipeline**: leads created in the last 30 days, grouped by their current `status` (New, Contacted, Qualified, Won, Lost), each with its count.
- **Upcoming viewings**: the next 5 REQUESTED or CONFIRMED viewings on the agent's leads whose start (`confirmed_for`, else `requested_for`) is in the future, soonest first, with home, visitor name, time in Sylhet, status, and a link to the lead.
- **Also**: the agency wide "Booked through the assistant, last 30 days" count from spec 0018.
- **Cache**: dynamic, read on each visit (agent data); one `requireAgent` call.

## Code area
`app/dashboard/page.tsx`, `app/dashboard/dashboard-nav.tsx`, `lib/server/dashboard-overview.ts`, `lib/server/auth.ts`

## Requirements
- **AC-1**: An agent signing in lands on `/dashboard`; a visitor opening it gets the same 404 as other dashboard pages.
- **AC-2**: The page shows this week's new leads, last week's, and 8 weekly bars, all from the agent's assigned leads.
- **AC-3**: The pipeline shows each status's count of leads created in the last 30 days, and the counts add up to the 30 day total.
- **AC-4**: Upcoming viewings list at most 5 future active viewings, soonest first, times in Sylhet.
- **AC-5**: With no leads, each section shows an empty state, not zeros in a broken chart.

## Ratify
This decision was recorded by /develop, not deliberated. Run `/architect agent dashboard overview` to deliberate and ratify it. Until then it stays flagged as an owed decision; it does not block marking the feature `done`.
