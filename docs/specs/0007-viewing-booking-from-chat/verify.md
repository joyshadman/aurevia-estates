# Verify: viewing booking from chat · spec 0007 · updated 2026-10-19
_Steps derived from spec 0007 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

The UI steps need a signed in visitor (feature 5) and a working model (`OPENROUTER_API_KEY`).

## Commands
- [ ] `npm run test:db` → `tests/db/viewing-bookings.test.ts`, `tests/db/bookings.test.ts` pass → AC-1 to AC-13
- [ ] `npm run eval:assistant` → the 3 booking cases pass and no case creates a viewing → AC-14
- [ ] `npm run db:drift` (with `SHADOW_DATABASE_URL`) → no difference → data model

## UI / manual
- [ ] After results, "Can we see the first one this weekend?" → a booking card with name, phone (Bangladesh preselected), WhatsApp tick, note, and slots; the reply never says it's booked → AC-1, AC-2
- [ ] Confirm is disabled until name, a valid phone, and a slot are set, and while the assistant is still replying → AC-2
- [ ] Slots run from tomorrow to 14 days ahead, no Fridays, 10:00, 12:00, 15:00, 17:00 Sylhet; with the computer clock in London, each shows the London time too → AC-3
- [ ] Confirm → the card collapses to "Booking sent" and a confirmation card shows the home, Sylhet and local time, Requested, and the advisor; no new model reply; the daily count is unchanged → AC-4, AC-5
- [ ] Double click Confirm, or confirm in two tabs → one lead, one viewing, one confirmation card → AC-4
- [ ] Ask to book the same home at another time → "You already have a viewing for this home on …" → AC-6
- [ ] Book again from a new conversation with a new phone → the lead in the database shows the new phone and NOTE activities → AC-6, AC-7
- [ ] Have an agent confirm in the database (`confirmed_for`), reload the chat → "Confirmed" with that time; past the time → "Awaiting update"; unpublish the home → "This home is no longer available" → AC-8
- [ ] Change time from the card 3+ hours ahead → the card shows the new time and "Rescheduled to this time"; within 2 hours → "Call or WhatsApp your advisor" → AC-8, AC-9
- [ ] Book 5 homes, try a 6th → refused; change one viewing 3 times, try a 4th → refused → AC-10
- [ ] `/account` → "Your viewings" lists upcoming (soonest first) then recent → AC-11
- [ ] As an agent, ask the assistant to book → "Only buyers can book viewings from the assistant." → AC-12
- [ ] After a change from `/account`, ask "When is my viewing?" → the new time → AC-13

## Value sourcing checks
- [ ] Slots: generated at render and checked again at submit (a slot that just left the window is refused with fresh slots)
- [ ] Prefill: name, phone with its country, and the WhatsApp tick come from the profile
- [ ] Advisor name: the agent's full name only when their profile is public, else "an Aurevia advisor"
- [ ] Active viewing count: only REQUESTED or CONFIRMED with a future start count toward 5
- [ ] Change count: viewings on the lead cancelled as "Rescheduled by visitor"
- [ ] Local time: from the browser's time zone; hidden when it matches Sylhet

## Not built yet
- The WhatsApp tick on `/account`'s phone field (AC-11): it joins spec 0004's profile form.
- The wider account deletion scrub (security model): lands with feature 17.

## Acceptance-criteria coverage
- AC-1 tool test and card step · AC-2 card steps · AC-3 slot test and step · AC-4 double submit test and step · AC-5 confirmation test and step · AC-6 already booked test · AC-7 contact refresh and WON tests · AC-8 live card tests · AC-9 change tests · AC-10 cap tests · AC-11 account list test and step · AC-12 refusal tests · AC-13 note test · AC-14 eval
