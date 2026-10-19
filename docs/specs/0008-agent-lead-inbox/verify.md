# Verify: agent lead inbox · spec 0008 (assumed) · updated 2026-10-19
_Steps derived from the scope's Done when and spec 0008's assumption. `/check verify` runs these; `/test` locks the durable ones._

The UI steps need a signed in agent (feature 5).

## Commands
- [ ] `npm run test:db` → `tests/db/lead-inbox.test.ts` and `tests/db/dashboard-gate.test.ts` pass

## UI / manual
- [ ] Book a viewing as a visitor; as the listing's agent open `/dashboard/leads` → the lead shows with name, phone, WhatsApp mark, home, viewing time in Sylhet, Requested → Done when
- [ ] Turn off "Assigned to me" → colleagues' leads appear; the New and All tabs filter as named
- [ ] Open the lead → Call and WhatsApp links work; the booking note shows; "Read the chat" opens the transcript read only → Done when
- [ ] Mark contacted → status Contacted and a history entry; the chat's confirmation card is unchanged until the viewing changes → Done when
- [ ] Confirm at another time (date and time in Sylhet) → the visitor's chat card shows Confirmed with that time
- [ ] After the time, mark Completed or No show; cancel with a reason on another lead → the visitor's card follows
- [ ] Add a note → it appears in the history with your name
- [ ] Open a general contact form lead (unassigned) → "Take this lead" assigns it to you; a colleague taking it at the same moment gets the stale message
- [ ] As a visitor, open `/dashboard/leads` → 404 page

## Value sourcing checks
- [ ] Contact: the lead's snapshot (refreshed by the visitor's later bookings while open), never the live profile
- [ ] Viewing time: `confirmed_for` when set, else `requested_for`, shown in Asia/Dhaka
- [ ] Confirm at another time: the typed Sylhet date and time is stored as the right UTC instant
