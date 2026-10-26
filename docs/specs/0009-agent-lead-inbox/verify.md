# Verify: Agent lead inbox · spec 0009 · updated 2026-10-26
_Steps derived from spec 0009 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Set up first (recommended): one agent with 2FA on and a fresh authenticator code, a second agent, and a visitor who books a viewing from the assistant (spec 0007). All times below are Sylhet time.

## UI / manual
- [ ] As the agent, open `/dashboard/leads` → the visitor's new lead is under **Needs action** (the default tab), and the tab counts read Needs action 1, Upcoming 0, Open 1, Closed 0 → AC-1
- [ ] Look at the lead's row → Visitor shows name, phone, and a WhatsApp badge (booked with WhatsApp ticked); Home shows title and AUR code; Viewing shows the requested time and "Requested"; Lead shows "New"; Advisor shows the listing's agent or "Unassigned"; Received shows the booking time → AC-3
- [ ] Click the visitor's name → `/dashboard/leads/<id>` opens → AC-3
- [ ] Open `/dashboard/leads/not-a-uuid` and `/dashboard/leads/<random uuid>` → both are 404 → AC-5
- [ ] On the lead page → contact (name, Call link, WhatsApp link to `wa.me/<digits>`, email), source "Booked in the assistant", status, received time, home with listing status and an "Open listing" link to `/dashboard/listings/<listing id>`, advisor controls, current viewing, activity history (Viewing requested, the visitor's note, each with a name and time), the note box with the personal data hint, and the chat transcript → AC-5
- [ ] In the transcript → the visitor's and assistant's words as written, and cards as single lines ("Showed homes: AUR-…", "Showed a booking card for AUR-…", "Viewing requested"); no buttons inside it → AC-14
- [ ] Click **Confirm requested time** → toast, viewing shows "Confirmed", lead becomes "Contacted", activity shows "Viewing confirmed · Confirmed for <time> Sylhet" and "Lead moved from New to Contacted" → AC-6
- [ ] Back on `/dashboard/leads` → the lead left Needs action and is under **Upcoming** with the counts updated → AC-1, AC-6
- [ ] As the visitor, reload the chat and `/account` → the card shows Confirmed with the agent's time → AC-17
- [ ] On a second REQUESTED viewing, click **Confirm another time**, pick a date and a time in 15 minute steps → it confirms at that time; the date list runs from today to 30 days ahead; picking earlier today shows "Pick a time in the future." → AC-6
- [ ] On a CONFIRMED viewing, **Change time** to the same time → "That's already the confirmed time."; to a new time → saved, activity "Viewing time changed · Time changed to <time> Sylhet", the visitor's card shows the new time → AC-7, AC-17
- [ ] Before the confirmed time → no **Completed** or **No show** buttons, and the hint "Completed and No show appear once the viewing time has passed." shows → AC-9
- [ ] After the confirmed time passes → the row says "Awaiting update" and the lead is back in Needs action; **Completed** closes it, the visitor's card shows Completed → AC-1, AC-9, AC-17
- [ ] **Cancel viewing** with an empty reason → "Give a reason of 1 to 200 characters."; with a reason → cancelled, the reason shows under Earlier viewings and in the activity, the visitor's card shows Cancelled → AC-8, AC-17
- [ ] Lead status buttons follow the status: New shows Mark contacted, Qualified, Lost; Contacted shows Qualified, Lost; Qualified shows Won, Lost → AC-11
- [ ] **Lost** asks for a reason (empty refused); **Won** asks to confirm → the lead moves to **Closed**; on it, Confirm and Change time are gone but Cancel (and Completed / No show after the time) remain → AC-10, AC-11
- [ ] Add a note of 2,000 characters → saved as "Note" by you; an empty note is refused → AC-12
- [ ] On an open lead, **Assign to me** → advisor is you, activity "Advisor changed from Unassigned to <you>"; pick the second agent and **Assign** → advisor changes → AC-13
- [ ] With **Mine only** on, the lead assigned to the second agent is hidden; turn it off → it shows; an unassigned lead shows for both agents → AC-2
- [ ] Order: a lead with tomorrow's viewing comes before one next week, and both before leads with no viewing → AC-2
- [ ] Search part of a name (any case), 5 digits of a phone, and `aur-1001` → each finds its lead, and the tab counts follow the search → AC-4
- [ ] As the visitor, delete the conversation; as the agent, reload the lead → "The visitor deleted this conversation." → AC-14
- [ ] With two tabs open on the same REQUESTED viewing, confirm in one, then confirm in the other → "This lead just changed. Refresh to see it." and nothing changes → AC-15
- [ ] With the agent's lead page open, the visitor changes the viewing time from the chat; the agent then confirms → "This lead just changed. Refresh to see it." → AC-15
- [ ] Sign in as a visitor and open `/dashboard/leads` and a lead page → 404; as an agent past 12 hours since the last authenticator code → sent to sign in again → AC-16

## Value sourcing
- [ ] Mine only: sign in as each agent → each sees their own leads plus unassigned ones (source: the signed in agent's id) → `listInbox` "the agent"
- [ ] Viewing start: a confirmed viewing whose agreed time differs from the requested one shows the confirmed time in the table and "The buyer asked for <requested>" on the lead page (source: `coalesce(confirmed_for, requested_for)`) → `listInbox` current viewing
- [ ] Viewing state: an active viewing one minute past its start reads "Awaiting update", not Requested or Confirmed → `listInbox` state label
- [ ] Contact snapshot: change the visitor's profile name in `/account` → the lead still shows the name given at booking (source: `leads.contact_*`) → `listInbox` visitor contact
- [ ] Advisor: soft delete the assigned agent (or unassign) → the row shows the name from `profiles`, or "Unassigned" when null → `listInbox` advisor
- [ ] Received: a lead created at 23:30 UTC shows the next calendar day in Sylhet time → `listInbox` received
- [ ] Tab counts: with a search active, every tab's count matches the rows that tab lists for that search → `listInbox` counts
- [ ] WhatsApp link: a lead booked without WhatsApp shows no WhatsApp link even though it has a phone → `getLeadDetail` WhatsApp link
- [ ] Activity actor: an activity whose actor's profile was removed shows "Removed user" → `getLeadDetail` actor name
- [ ] Listing link: "Open listing" goes to `/dashboard/listings/<listing_id>` → `getLeadDetail` listing link
- [ ] Agent picker: a deleted agent and a visitor never appear in the advisor list → `getLeadDetail` agent picker
- [ ] Which actions show: a REQUESTED viewing whose requested time has passed shows Confirm another time but not Confirm requested time → `getLeadDetail` actions
- [ ] Confirm another time: picking 3:00 PM on a date confirms 09:00 UTC on that date (UTC+6), and the activity says "3:00 PM Sylhet" → `confirmViewing` `confirmed_for`
- [ ] Confirm on a CONTACTED lead does not add a status change; on a NEW lead it does → `confirmViewing` lead move
- [ ] Change time: the new `confirmed_for` equals the picked Dhaka time at UTC+6 → `changeViewingTimeAsAgent`
- [ ] Stale check: any visitor change to the viewing between page load and click is refused (`viewings.updated_at` moved) → all viewing actions
- [ ] Allowed moves match `lib/domain/lead-status.ts` from the current status → `moveLead`
- [ ] Assignment activity names the old and new advisor from `profiles` → `assignLead`
- [ ] The transcript only ever shows the lead's own conversation; no action takes a conversation id → `loadTranscript`
- [ ] Every time on both pages is Sylhet time, also with the browser set to London → all times shown

## Commands
- [ ] `npm run typecheck` → no errors
- [ ] `npm run lint` → no errors
- [ ] `npm run build` → `/dashboard/leads` and `/dashboard/leads/[id]` build
- [ ] `npm run test:e2e -- agent-gate` → every dashboard page imports `requireAgent` → AC-16

## Acceptance criteria coverage
- AC-1: Needs action default, Upcoming move, Awaiting update back to Needs action, counts with search
- AC-2: Mine only both agents, sort order
- AC-3: row fields, row link
- AC-4: name, digits, code search
- AC-5: lead page contents, 404s
- AC-6: confirm requested, confirm another time, NEW to CONTACTED, past time
- AC-7: change time same and new
- AC-8: cancel with and without reason
- AC-9: close hidden and refused before time, Completed after
- AC-10: closed lead keeps cancel and close only
- AC-11: moves per status, Lost reason, Won confirm
- AC-12: note
- AC-13: Assign to me, picker
- AC-14: transcript lines, deleted conversation
- AC-15: two tabs, visitor change meanwhile
- AC-16: visitor 404, stale code, gate scan
- AC-17: visitor card and `/account` after confirm, change, cancel, close
