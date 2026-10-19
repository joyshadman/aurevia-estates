# 0008 · Agent lead inbox

**Status**: Assumed
**Date**: 2026-10-19
**Authorized by**: Joy Shadmane, during /develop

## Owed decision
The inbox page's layout, filters, and the follow-up actions an agent can take from it. Spec 0002 settles access (agents read and update all leads; the inbox defaults to "assigned to me"; the conversation is read only through the lead; contact comes from the lead snapshot) and the status rules; spec 0007's follow-up names the viewing actions. Nothing pins down the page itself.

## Assumption built on
- `/dashboard/leads`: a table of leads, newest first, 25 a page (keyset on `created_at desc, id desc`). Tabs: Open (NEW, CONTACTED, QUALIFIED; the default), New, All. "Assigned to me" is on by default; off shows every lead, including unassigned contact form leads. Columns: contact (name, phone, a WhatsApp mark), listing (title and code), viewing (current viewing's time in Sylhet and its status), source, status, received (date in Asia/Dhaka). Each row opens the lead.
- `/dashboard/leads/[id]`: contact (name, phone with `tel:` and, when `contact_whatsapp`, a `wa.me` link; email), the visitor's message or booking note, the listing (link to its edit page), the assigned agent, viewings (newest first, current one highlighted), and the activity history. Actions:
  - Lead status through `transitionLead`: Mark contacted, Mark qualified, Won, Lost (only moves the state machine allows).
  - Current viewing through `transitionViewing`: Confirm (at the requested time, or another date and time the agent enters, stored as `confirmed_for`), Completed, No show, Cancel (with a reason).
  - Add a note (NOTE activity, up to 1,000 characters), with the reminder not to paste buyer personal data (spec 0002).
  - Take the lead (assign it to yourself) when it is unassigned.
- `/dashboard/leads/[id]/conversation`: the linked conversation as a read only transcript (text and the homes shown, by code), reached only through the lead; 404 when the lead has none.
- Every page calls `requireAgent()`; every action calls `requireAgentAction()`. A concurrent change returns the `stale_status` message.

## Code area
`app/dashboard/leads/`, `lib/server/lead-inbox.ts`, `tests/db/lead-inbox.test.ts`

## Requirements
- An agent sees new viewings with visitor contact, listing, time, and a link to the conversation (scope, Done when).
- An agent can mark a lead contacted (scope, Done when).
- Spec 0007 follow-up: show `contact_whatsapp`, the note, NOTE activities, and the conversation; confirm a time (`confirmed_for`), propose another, and mark completed or no show.

## Ratify
This decision was recorded by /develop, not deliberated. Run `/architect agent lead inbox`
to deliberate and ratify it. Until then it stays flagged as an owed decision; it does not block marking the feature `done`.
