# Verify: viewing booking from chat · spec 0007 · updated 2026-10-23
_Steps derived from spec 0007 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

Setup: a signed in VISITOR, the sample listings (`npm run db:seed -- --sample`), the browser time zone set to Europe/London unless a step says otherwise.

## UI / manual
- [ ] In a chat, search ("4 bedroom house in Shibgonj under 2.5 crore"), then ask "Can we see the first one?" → a booking card appears for that home; the reply never says a viewing is booked → AC-1
- [ ] Ask to book a code that was never shown (e.g. AUR-1042) → no booking card; the assistant offers to search instead → AC-1
- [ ] The card shows title, area, and code; name, phone (country preselected from the saved number, Bangladesh when none), the WhatsApp tick, the note prefilled with the assistant's suggestion → AC-2
- [ ] While the reply that showed the card is still streaming, Confirm is disabled and says the assistant is still replying → AC-2
- [ ] Confirm stays disabled until name, phone, and a slot are set; a wrong phone for the chosen country shows the phone error → AC-2
- [ ] Slots start tomorrow, end today + 14, never show a Friday, and offer 10:00 AM, 12:00 PM, 3:00 PM, 5:00 PM Sylhet → AC-3
- [ ] With the browser in Europe/London each slot also shows the London time; with the browser in Asia/Dhaka (or Asia/Dacca) no second time shows → AC-3
- [ ] Arrow keys move between slots; the focused slot shows the focus ring → AC-3
- [ ] Confirm → the card collapses to "Booking sent", a confirmation card appears below without a page reload, with home, Sylhet and local time, Requested, the advisor name (or "an Aurevia advisor"), and "Your advisor will confirm by phone or WhatsApp." → AC-4, AC-5
- [ ] Today's remaining message count does not change after Confirm → AC-5
- [ ] Reload the chat → the booking card stays collapsed and the confirmation card still shows the current state → AC-5, AC-8
- [ ] Ask for a viewing of the same home at a different time → the card shows "You already have a viewing for this home on <time>" with Change time and Cancel → AC-6
- [ ] An agent confirms the viewing (set `confirmed_for` and status CONFIRMED in the database) → the chat card shows Confirmed with the agent's time → AC-8
- [ ] Set an active viewing's start in the past → the card shows "Awaiting update" and "Call or WhatsApp your advisor" → AC-8
- [ ] Unpublish the listing → its active confirmation card shows "This home is no longer available"; Change time is gone, Cancel still works → AC-8, AC-9
- [ ] Change time from `/account` → the chat card for the original viewing shows "Rescheduled to <new time>" → AC-8, AC-9
- [ ] Change time more than 2 hours ahead → new time shown, Requested; picking the current time is not offered → AC-9
- [ ] Cancel with a reason → Cancelled; the reason is on the viewing and in the lead's history → AC-9
- [ ] A viewing less than 2 hours away shows only "Call or WhatsApp your advisor to change this viewing." → AC-9
- [ ] `/account` as a visitor shows "Your viewings": upcoming soonest first with Change time and Cancel, then up to 5 others latest first; as an agent the section is absent → AC-11
- [ ] The WhatsApp tick on `/account` saves and comes back prefilled on the next booking card → AC-11, AC-2
- [ ] Sign in as an agent and ask to book → the assistant says only buyers can book; no card → AC-12
- [ ] After changing a viewing from `/account`, ask the assistant "When is my viewing?" → it gives the new time → AC-13
- [ ] Both themes and a 390px wide screen: cards fit, no horizontal scroll, slots wrap in two columns → design.md

## Commands
- [ ] `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` → "This is an empty migration." (the `booking_whatsapp` columns are live) → data model
- [ ] `npm run typecheck`, `npm run lint`, `npm run build` → all pass
- [ ] `npm run eval:assistant` → PASS with every booking case passing and 0 grounding failures → AC-14
- [ ] Booking service check (two concurrent Confirms with the same slot) → both succeed, one lead, one viewing, one confirmation card → AC-4
- [ ] Two chats book the same home at the same moment at different times → one succeeds, the other gets `already_booked`, and nothing it wrote (profile, notes) is kept → AC-6
- [ ] With 4 active viewings, two bookings for different homes at the same moment → exactly one succeeds, the other is `too_many_viewings` → AC-10
- [ ] A 4th time change on one lead → `too_many_changes` → AC-10
- [ ] Booking into an open lead with a new phone and from another chat → `contact_*` updated, NOTEs "Contact details updated by the visitor" and "Booked again from another conversation"; a WON lead is never changed (a new lead is created) → AC-6, AC-7
- [ ] Booking into an open LISTING_INQUIRY lead with no conversation → the lead takes this conversation, no "another conversation" note → AC-6
- [ ] Another visitor's viewing id to change or cancel → `not_found` → AC-12
- [ ] Changing or cancelling a viewing an agent already cancelled → `stale_status`, not `too_late` → AC-9

## Value sourcing
- [ ] slots: render the card at 23:30 Dhaka time → tomorrow's slots are the next Dhaka day, not the next UTC day → *Value sourcing* slots
- [ ] prefill: a saved `+8801712345678` shows Bangladesh and `01712-345678`; no saved phone shows Bangladesh and an empty field → prefill
- [ ] prefill note: a card with no suggestion shows an empty note → prefill note
- [ ] advisor name: an agent with `agent_is_public` false, no agent, or a deleted agent all show "an Aurevia advisor" → advisor name
- [ ] `requested_for`: equals the picked slot's instant; a client sending `+06:00` form still matches → requested_for
- [ ] active viewing count: a past REQUESTED viewing does not count toward the 5 → active viewing count
- [ ] change count: only viewings cancelled as "Rescheduled by visitor" count; agent reschedules do not → change count
- [ ] current user: a signed out request to any booking action returns `signed_out` (reads `not_found`) → current user
- [ ] local time: Europe/London in summer and winter both show the right local time; Asia/Kolkata shows +30 minutes → local time
- [ ] success metric: every chat booking has `viewings.conversation_id` set; a viewing joined to a LISTING_INQUIRY lead still has it → success metric
- [ ] account sort: a CONFIRMED viewing whose `confirmed_for` is earlier than another's `requested_for` sorts first → account sort
- [ ] model note: the note uses `confirmed_for` when set, else `requested_for`, and only the newest card per lead → model history

## Acceptance-criteria coverage
- AC-1 … UI 1, 2 · AC-2 … UI 3 to 5, 21, prefill · AC-3 … UI 6 to 8, slots, local time · AC-4 … UI 9, Commands 4 · AC-5 … UI 9 to 11 · AC-6 … UI 12, Commands 5, 8, 9 · AC-7 … Commands 8 · AC-8 … UI 11, 13 to 16 · AC-9 … UI 15 to 19, Commands 11 · AC-10 … Commands 6, 7 · AC-11 … UI 20, 21 · AC-12 … UI 22, Commands 10 · AC-13 … UI 23, model note · AC-14 … Commands 3
