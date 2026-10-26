# 0009. Agent lead inbox

**Date**: 2026-10-23
**Status**: In Progress

## Summary

Agents get a lead inbox at `/dashboard/leads`. It's a table sorted by the soonest viewing, with tabs that put what needs doing first (new leads, unconfirmed viewings, and viewings whose time has passed). Each lead opens on its own page. There the agent sees the buyer's contact details, confirms or changes the viewing time they agreed by phone, cancels or closes viewings, moves the lead through its stages, writes notes, assigns it, and reads the buyer's chat (read only). Everything uses the tables that already exist, so there's no migration, and the buyer's chat card and account page update automatically.

## Requirements

**User stories**:
- As an agent, I want to see first the leads that need me, so that no viewing request waits.
- As an agent, I want to confirm the time I agreed with the buyer by phone, so that the buyer sees it in their chat.
- As an agent, I want the buyer's contact details, note, and chat in one place, so that I can call prepared.
- As an agent, I want to record how a lead and its viewings ended, so that the agency's records are true.

**Acceptance criteria**:
- **AC-1**: `/dashboard/leads` shows a table of leads, 25 per page, with tabs and counts: **Needs action** (an open lead that is NEW, or has a REQUESTED viewing, or has an active viewing whose start has passed), **Upcoming** (an open lead with a CONFIRMED viewing whose start is in the future, and not in Needs action), **Open** (every NEW, CONTACTED, or QUALIFIED lead), **Closed** (WON or LOST). Needs action is the default tab. Each tab label shows its count for the current Mine only and search. A viewing's start is `confirmed_for` when set, else `requested_for`.
- **AC-2**: "Mine only" is on by default and shows leads assigned to the agent plus leads with no assigned agent; off shows every lead. Rows are ordered by the start of the lead's active viewing (soonest first; leads without one after), then by when the lead came in (newest first).
- **AC-3**: Each row shows Visitor (contact name, phone, and a WhatsApp badge when `contact_whatsapp` is true), Home (title and code), Viewing (start in Sylhet time and its state, or "No viewing"), Lead status, Advisor (assigned agent's name, or "Unassigned"), and Received (when the lead came in). A row links to the lead page. Empty results show an empty state that fits the tab.
- **AC-4**: One search box matches the contact name (case insensitive, contains), the phone (the digits typed, contained in the stored number's digits), or an exact listing code (`aur-1042` matches AUR-1042). Search applies across tabs and counts.
- **AC-5**: `/dashboard/leads/[id]` shows the contact (name, phone as a call link, a WhatsApp link when `contact_whatsapp` is true, email), source, lead status, received time, the home (title, code, status, link to its listing page), the advisor with assignment controls, the current viewing with its actions, earlier viewings (newest first, with status, start, and cancel reason), the activity history (newest first: notes, status changes, viewing changes, system lines, each with the actor's name and time), the note box, and the chat transcript. An unknown or malformed id is a 404.
- **AC-6**: Confirm: on a REQUESTED viewing of an open lead, "Confirm requested time" (shown only while `requested_for` is in the future) or "Confirm another time" (a date from today to 30 days ahead and a time in 15 minute steps, both Sylhet time, which must be in the future) moves it to CONFIRMED with `confirmed_for` set. If the lead is NEW, it moves to CONTACTED in the same transaction (`contacted_at` set, STATUS_CHANGE activity).
- **AC-7**: Change time: on a CONFIRMED viewing of an open lead, the agent picks a new future time (as in AC-6, different from the current one); the viewing stays CONFIRMED with the new `confirmed_for`.
- **AC-8**: Cancel: an agent cancels a REQUESTED or CONFIRMED viewing at any time, on any lead, with a required reason (1 to 200 characters), written to `cancel_reason` and the activity.
- **AC-9**: Close: on a CONFIRMED viewing whose `confirmed_for` has passed, on any lead, the agent marks it Completed or No show. These buttons don't appear before that time, and the server refuses them (`too_early`).
- **AC-10**: On a WON or LOST lead, viewings can only be closed (AC-9) or cancelled (AC-8); Confirm and Change time are hidden and refused (`lead_closed`).
- **AC-11**: Lead moves follow spec 0002's state machine, one button per allowed move from the current status (Mark contacted, Qualified, Won, Lost). Lost asks for a reason (1 to 200 characters, the activity body). Won asks to confirm. Leaving NEW sets `contacted_at`.
- **AC-12**: Notes: the agent adds a note (1 to 2000 characters), saved as a NOTE activity by them. The box says not to paste the buyer's personal data (spec 0002).
- **AC-13**: Assignment: on an open lead, "Assign to me" (when it isn't already theirs) and a picker of every agent (role AGENT, not deleted) change `assigned_agent_id`, with a SYSTEM activity naming the old and new advisor.
- **AC-14**: Transcript: when the lead has a conversation, the lead page shows its latest 30 messages read only. Visitor and assistant text appears as written. Cards appear as one line each ("Showed homes: AUR-1006, AUR-1002", "Looked up AUR-1006", "Showed a booking card for AUR-1006", "Viewing requested"). "Show earlier" loads 30 more. When the conversation was deleted, the page says "The visitor deleted this conversation." Nothing in the transcript can be acted on.
- **AC-15**: Concurrency: when two agents act on the same viewing or lead at once, or the visitor changes the viewing meanwhile, the later action changes nothing and shows "This lead just changed. Refresh to see it."
- **AC-16**: Only agents reach these pages and actions, through spec 0008's agent gate (a fresh authenticator code). Anyone else gets the gate's response, and nothing is read or written.
- **AC-17**: The visitor's chat card and `/account` reflect every agent change on their next load (spec 0007, AC-8): Confirmed with the agent's time, the changed time, Cancelled, Completed, or No show.

## Decision

**Chosen option**: Option 1: Dedicated inbox and lead pages with action tabs.

Agents work leads from a sorted table with action tabs and a full lead page, through server actions over spec 0002's status writers, with no schema change.

**Implementation skills**: `prisma-client-api` (`prisma/skills`, `.claude/skills/prisma-client-api/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`)

## Rationale

The context, the options considered, and the reasoning are in [rationale.md](rationale.md).

## Feature design

### Data model

No migration. The inbox reads and writes existing columns (spec 0002, spec 0007):

| Table | Read | Written by this feature |
|---|---|---|
| `leads` | `status`, `source`, `contact_name`, `contact_phone`, `contact_email`, `contact_whatsapp`, `assigned_agent_id`, `listing_id`, `conversation_id`, `contacted_at`, `created_at` | `status` and `contacted_at` (through `transitionLead`), `assigned_agent_id` |
| `viewings` (N:1 lead) | `status`, `requested_for`, `confirmed_for`, `cancel_reason`, `updated_at` | `status`, `confirmed_for`, `cancel_reason` (through `viewing-status.ts`) |
| `lead_activities` (N:1 lead, N:1 actor profile) | every row with its actor's name | NOTE, STATUS_CHANGE, VIEWING_CHANGE, SYSTEM rows |
| `chat_messages` (through `leads.conversation_id`) | `role`, `parts`, `seq` | nothing |
| `listings` | `title`, `ref_code`, `status` | nothing |
| `profiles` | agent names (`full_name`, email), the agent picker (`role = AGENT`, `deleted_at` null) | nothing |

### State transitions

- **Lead** (spec 0002, unchanged): NEW → CONTACTED → QUALIFIED → WON; NEW → QUALIFIED; any open state → LOST. WON and LOST are terminal.
- **Viewing** (spec 0002, agent moves): REQUESTED → CONFIRMED (sets `confirmed_for`) · REQUESTED or CONFIRMED → CANCELLED (reason required for agents) · CONFIRMED → COMPLETED or NO_SHOW (only once `confirmed_for` has passed, this spec) · CONFIRMED → CONFIRMED with a new `confirmed_for` (a time change, not a status change).
- **Coupled move**: confirming a viewing on a NEW lead also moves the lead to CONTACTED (AC-6).

### Writers

In `lib/server/viewing-status.ts` (the only writer of viewings' status and times):
- `transitionViewingIn` already confirms (`extra.confirmedFor`) and cancels (`extra.cancelReason`). For an agent cancel the service requires the reason before calling it.
- New `changeConfirmedTimeIn(tx, id, confirmedFor, actor)`: AGENT only, guarded update `where status = 'CONFIRMED'`. No row updated → `StaleStatusError`. Writes a VIEWING_CHANGE activity (from and to CONFIRMED) with the body `Time changed to <Sun 19 Oct, 3:00 PM> Sylhet`.
- Confirm writes the body `Confirmed for <time> Sylhet`. Cancel writes the reason. Close writes no body.

`lib/server/lead-status.ts`: `transitionLead` gains a `transitionLeadIn(tx, …)` twin (same body), so a confirm can move the lead in the viewing's transaction. `transitionLead` keeps its signature and calls it.

### Services and actions

Services in `lib/server/lead-inbox.ts`; actions in `app/dashboard/leads/actions.ts` with words in `app/dashboard/leads/messages.ts` (the `app/` convention). Pages call `requireAgent({ next })`; every action calls `requireAgentAction()` first and returns its denial reason (`signed_out`, `not_found`, `mfa_required`) unchanged. Every action validates with Zod and returns `{ ok: true, ... } | { ok: false, reason }`. Every write runs in one transaction that first locks the lead row (`SELECT ... FROM leads WHERE id = $1 FOR UPDATE`), the same lock visitor change and cancel take (spec 0007).

| Function | Kind | Key inputs | Key outputs | Key errors (reason) |
|---|---|---|---|---|
| `listInbox` | page read | `tab` (`action` · `upcoming` · `open` · `closed`), `q`, `mine` (`1`/`0`), `page` (1 based) | rows (AC-3), `counts` per tab, `hasNext` | none (bad params fall back to defaults) |
| `getLeadDetail` | page read | `leadId` | lead, listing, current viewing (with `version`), earlier viewings, activities with actor names, agent picker list | 404 |
| `loadTranscript` | action (read) | `leadId`, `beforeSeq?` | up to 30 transcript lines (oldest first), `earliestSeq`, `hasEarlier`, `deleted` | `not_found` |
| `confirmViewing` | action | `viewingId`, `version`, `at?` (`{ date: YYYY-MM-DD, time: HH:mm }`, Sylhet; absent = the requested time) | `{ ok }` | `not_found`, `stale_status`, `lead_closed`, `time_in_past`, `invalid` |
| `changeViewingTimeAsAgent` | action | `viewingId`, `version`, `at` | `{ ok }` | `not_found`, `stale_status`, `lead_closed`, `time_in_past`, `unchanged`, `invalid` |
| `cancelViewingAsAgent` | action | `viewingId`, `version`, `reason` (1 to 200) | `{ ok }` | `not_found`, `stale_status`, `invalid` |
| `closeViewing` | action | `viewingId`, `version`, `outcome` (`COMPLETED` · `NO_SHOW`) | `{ ok }` | `not_found`, `stale_status`, `too_early` |
| `moveLead` | action | `leadId`, `from` (the status the page showed), `to`, `reason?` (required for LOST, 1 to 200) | `{ ok }` | `not_found`, `stale_status`, `invalid_move`, `invalid` |
| `addLeadNote` | action | `leadId`, `body` (1 to 2000) | `{ ok }` | `not_found`, `invalid` |
| `assignLead` | action | `leadId`, `from` (the agent id the page showed, or null), `agentId` | `{ ok }` | `not_found`, `stale_status`, `lead_closed`, `not_an_agent` |

After a successful write the action calls `revalidatePath("/dashboard/leads")` and `revalidatePath("/dashboard/leads/<id>")`. The client refreshes with `router.refresh()`.

**Stale checks (AC-15)**: viewing actions carry `version` (the viewing's `updated_at` as ISO, read with the page). Under the lead lock the service rereads the viewing, and a different `updated_at`, or a status the action doesn't allow, returns `stale_status`. `moveLead` carries `from`. `assignLead` carries `from`. Notes have no stale check (they only add).

**Times (Sylhet)**: agent pages show every time in Sylhet time with `formatViewingTime` (spec 0007's `lib/domain/viewing-slots.ts`), and no visitor local time. `at` is turned into an instant as date and time at UTC+6 (`lib/domain/viewing-slots.ts` gets `dhakaInstant(date, time)`). The time picker offers 00:00 to 23:45 in 15 minute steps. The date picker offers `dhakaToday()` through today + 30. The server checks `at` is after now and within 30 days.

### `listInbox` query

One raw SQL query (`$queryRaw`) for the page. For each lead, a lateral join picks its current active viewing (REQUESTED or CONFIRMED; at most one, by spec 0002's partial unique index), with `start = coalesce(confirmed_for, requested_for)`. Then:
- **Needs action**: `status IN ('NEW','CONTACTED','QUALIFIED') AND (status = 'NEW' OR v.status = 'REQUESTED' OR v.start <= now())`.
- **Upcoming**: open, `v.status = 'CONFIRMED' AND v.start > now()`, and the lead is not NEW.
- **Open**: `status IN ('NEW','CONTACTED','QUALIFIED')`. **Closed**: `status IN ('WON','LOST')`.
- **Mine**: `assigned_agent_id = $agent OR assigned_agent_id IS NULL`.
- **Search**: `contact_name ILIKE '%' || $q || '%'`, or (when `$q` has 4 or more digits) `regexp_replace(contact_phone, '\D', '', 'g') LIKE '%' || $digits || '%'`, or `listings.ref_code = normalizeRefCode($q)`.
- **Order**: `v.start ASC NULLS LAST, leads.created_at DESC, leads.id DESC`. **Paging**: `LIMIT 26 OFFSET (page - 1) * 25` (the 26th row only sets `hasNext`).
- **Counts**: a second query with four `count(*) FILTER (WHERE ...)` over the same Mine and search filters.

`page` paging is chosen over a cursor because the sort mixes a nullable viewing start with the lead's age (runner up: a composite cursor, which is more work for a 25 row agency inbox).

### Transcript

`loadTranscript` reads `chat_messages` for `leads.conversation_id` ordered by `seq` descending, 30 at a time (`seq < beforeSeq` for earlier pages), and returns them oldest first as lines:
- `user` and `assistant` text parts: the text.
- `tool-searchListings` and `data-matches`: "Showed homes: <codes>". `tool-getListingDetails`: "Looked up <code>". `tool-offerViewing`: "Showed a booking card for <code>" (or nothing for an error output). `data-viewing`: "Viewing requested". `tool-updateBrief` and reasoning: left out.
- `system` messages: the text, styled as a note.

A lead with `conversation_id` null and source CHAT_BOOKING means the conversation was deleted (AC-14). Other sources with no conversation show no transcript section.

### Value sourcing

| Action | Value produced / displayed | Source |
|---|---|---|
| listInbox | the agent ("mine") | `requireAgent()` user id |
| listInbox | a lead's current viewing and its start | lateral join: the active viewing; `coalesce(confirmed_for, requested_for)` |
| listInbox | Viewing state label | the viewing status, or "Awaiting update" when active and start ≤ now (spec 0007's rule), or "No viewing" |
| listInbox | Visitor contact, WhatsApp badge | `leads.contact_name`, `contact_phone`, `contact_whatsapp` (the snapshot, spec 0002) |
| listInbox | Advisor | `leads.assigned_agent_id` → `profiles` → `displayName()`; null → "Unassigned" |
| listInbox | Received | `leads.created_at` in Sylhet time |
| listInbox | tab counts | the counts query, same Mine and search filters |
| getLeadDetail | WhatsApp link | `https://wa.me/<contact_phone digits>`, only when `contact_whatsapp` is true |
| getLeadDetail | activity actor name | `lead_activities.actor_id` → `profiles` → `displayName()`; null → "Removed user" |
| getLeadDetail | listing link | `/dashboard/listings/<listing_id>` |
| getLeadDetail | agent picker | `profiles` with `role = 'AGENT'` and `deleted_at IS NULL`, by name |
| getLeadDetail | which viewing actions show | viewing status, lead status (open or closed), `requested_for` vs now (Confirm requested time), `confirmed_for` vs now (Close) |
| confirmViewing | `confirmed_for` | `at` → `dhakaInstant(date, time)`; absent → the viewing's `requested_for` |
| confirmViewing | lead moves to CONTACTED | the lead's status is NEW (AC-6) |
| changeViewingTimeAsAgent | new `confirmed_for` | `at` → `dhakaInstant` |
| all viewing actions | stale check | `version` input vs `viewings.updated_at` |
| moveLead | allowed moves | `lib/domain/lead-status.ts` `moves` from the current status |
| assignLead | old and new advisor names in the activity | `profiles` for `from` and `agentId` |
| loadTranscript | the conversation | `leads.conversation_id` only (an agent never passes a conversation id) |
| all times shown | time zone | Asia/Dhaka (`formatViewingTime`) |

### Key invariants

- Every write locks the lead row first, and a status changes only through its `*-status.ts` writer, in one transaction with its activity row.
- An agent never confirms or changes a time in the past, or on a closed lead.
- Completed and No show only follow a CONFIRMED viewing whose time has passed.
- A stale page never overwrites a newer change (AC-15).
- An agent reads a conversation only through a lead's `conversation_id`.

### Security model

- **Agents**: read and update every lead, viewing, and activity, and read a lead's conversation through the lead (spec 0002). Pages go through `requireAgent({ next })` (every page under `app/dashboard` calls it itself; `tests/e2e/agent-gate.spec.ts` checks this), and actions go through `requireAgentAction()` (spec 0008: role from the database, 2FA on, an authenticator code within 12 hours).
- **Visitors and sellers**: never reach these pages or actions. Visitors see the outcome only on their own chat card and `/account` (spec 0007).
- **Personal data**: contact details, notes, and the transcript are personal data shown only to agents. Agent notes are agency records kept on account deletion (spec 0002). The note box carries the "don't paste the buyer's personal data" hint.

### Error messages

| Reason | Message |
|---|---|
| `stale_status` | This lead just changed. Refresh to see it. |
| `lead_closed` | This lead is closed. You can only close or cancel its viewings. |
| `time_in_past` | Pick a time in the future. |
| `unchanged` | That's already the confirmed time. |
| `too_early` | You can mark this once the viewing time has passed. |
| `invalid_move` | That move isn't allowed from the lead's current status. |
| `not_an_agent` | Pick an agent from the list. |
| `not_found` | We couldn't find this lead. |
| `mfa_required`, `signed_out` | (spec 0008's messages) |
| `invalid` | (per field: reason, note, time) |

### Configuration required

None.

### Critical test scenarios

- Happy path: a visitor books (spec 0007); the lead shows under Needs action with its count; the agent opens it, sees contact, note, and transcript, and confirms the requested time. The lead becomes CONTACTED and moves to Upcoming. The visitor's chat card shows Confirmed. Verifies **AC-1**, **AC-3**, **AC-5**, **AC-6**, **AC-14**, **AC-17**.
- Confirm another time agreed by phone, then change it, then (after the time passes) mark Completed. A past time or the same time is refused. Verifies **AC-6**, **AC-7**, **AC-9**.
- Completed and No show are absent and refused before the time. Verifies **AC-9**.
- Agent cancel without a reason is refused; with one, the visitor's card shows Cancelled. Verifies **AC-8**, **AC-17**.
- Mark a lead Lost (reason required); its active viewing can still be cancelled or closed, but not confirmed or changed. Verifies **AC-10**, **AC-11**.
- Two agents confirm the same viewing at once: one succeeds, the other gets `stale_status`. The visitor changes the time while the agent's page is open: the agent's confirm gets `stale_status`. Verifies **AC-15**.
- Mine only: an unassigned lead shows for every agent; another agent's lead shows only with Mine only off; "Assign to me" moves it. Verifies **AC-2**, **AC-13**.
- Search by part of a name, by 5 phone digits, and by `aur-1001`. Verifies **AC-4**.
- A visitor deletes the conversation: the lead page says so. Verifies **AC-14**.
- A visitor or seller (or an agent without a fresh code) opening `/dashboard/leads/<id>` or calling an action gets the gate's response. Verifies **AC-16**.
- Sort: the lead with tomorrow's viewing comes before next week's, and both before leads with no viewing. Verifies **AC-2**.

## Build plan

Tracer Bullet: one lead end to end first (list, page, confirm), then thicken.

1. Thin thread: `listInbox` with tabs, counts, Mine only, and paging; the `/dashboard/leads` table; `getLeadDetail` and the lead page with contact, home, current viewing, and activity history; `transitionLeadIn`; `confirmViewing` (requested time and another time, `dhakaInstant`, the NEW → CONTACTED move, version check, lead lock), satisfies **AC-1**, **AC-2**, **AC-3**, **AC-5**, **AC-6**, **AC-15**, **AC-16**, **AC-17**
2. Viewing actions: `changeConfirmedTimeIn` and `changeViewingTimeAsAgent`, `cancelViewingAsAgent`, `closeViewing`, the closed lead rule, earlier viewings on the lead page, satisfies **AC-7**, **AC-8**, **AC-9**, **AC-10**
3. Lead actions: `moveLead` with the Lost reason and Won confirm, `addLeadNote`, `assignLead` with the agent picker, satisfies **AC-11**, **AC-12**, **AC-13**
4. Search, and the transcript with "Show earlier" and the deleted conversation state, satisfies **AC-4**, **AC-14**

## Consequences

**Positive**:
- What needs an agent comes first, and a passed viewing can't be forgotten (it stays in Needs action until closed).
- Agents record the time they agreed by phone, and the buyer sees it in their chat with no extra messaging.
- No migration, and every write goes through the existing status writers and their activity rows.

**Negative / tradeoffs**:
- The buyer isn't told about agent changes until they open the chat or `/account`; emails and WhatsApp wait for feature 19.
- An agent can set any future time, outside the booking slots, so the slot grid no longer bounds when viewings happen.
- Offset paging can skip or repeat a row when leads change between pages; acceptable at agency scale.
- Agents can read every buyer's chat through its lead, with no record of who read which; that's spec 0002's model.

**Neutral**:
- `viewing-status.ts` gains a time change writer, and `lead-status.ts` a transaction twin.
- `lib/domain/viewing-slots.ts` gains `dhakaInstant`.
- The dashboard home (feature 21) can reuse `listInbox`'s counts query.

## Follow-up

- [ ] Feature 19 (notifications): tell the buyer when an agent confirms, changes, or cancels a viewing, and alert the newly assigned agent.
- [ ] Consider an access log for agents reading transcripts if the agency grows or a compliance need appears.
- [ ] Spec 0002: note that agents may change a CONFIRMED viewing's time, and that Completed and No show require the time to have passed.
