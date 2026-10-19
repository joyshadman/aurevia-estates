# 0007. Viewing booking from chat

**Date**: 2026-10-17
**Status**: Accepted

## Summary

When a visitor wants to see a home, the assistant shows a booking card in the chat: name and phone prefilled from their profile, a "this number is on WhatsApp" tick, an optional note, and fixed time slots for the next 14 days (10:00, 12:00, 15:00, 17:00 Sylhet time, Fridays off). Nothing is booked until the visitor presses Confirm; the request becomes a lead and a viewing through spec 0002's booking function, and a fixed confirmation card (no AI call) shows the home, the time in Sylhet and local time, and the advisor. Visitors can change or cancel up to 2 hours before, from the chat or their account page, with caps that stop anyone flooding agents; agents confirm the actual time in the lead inbox (feature 9).

## Context

The success metric is viewings booked through the assistant. Spec 0002 already provides the lead and viewing tables, the idempotent `findOrCreateLeadAndViewing`, and the viewing state machine; spec 0006 provides the chat turn, the shown listing set, and the turn lock. Agent calendars are deferred, so a booking is a request the agent confirms. Buyers include families abroad in other time zones, and agents in Sylhet coordinate mostly by phone and WhatsApp. A booking must never happen because the model misread a message or followed injected text.

## Requirements

**User stories**:
- As a visitor, I want to request a viewing of a home I'm discussing without leaving the chat.
- As a visitor abroad, I want to see the time in my own time zone as well as Sylhet's.
- As a visitor, I want to change or cancel my viewing myself, in good time.
- As an agent, I want each request to arrive as one lead with the visitor's current number, whether it has WhatsApp, and any note.

**Acceptance criteria**:
- **AC-1**: When the visitor asks to see a home that was shown in the conversation (or is its starting listing) and is PUBLISHED, the assistant calls `offerViewing`, and a booking card appears. The assistant never says a viewing is booked; only the confirmation card does. For a home not shown, unpublished, or ambiguous, it asks which home or explains it can't be booked.
- **AC-2**: The booking card shows the home (title, area, `ref_code`), name (prefilled from `profiles.full_name`), phone (prefilled from `profiles.phone`, any country, Bangladesh preselected, validated to E.164), a "This number is on WhatsApp" tick (prefilled from `profiles.phone_is_whatsapp`), an optional note (up to 500 characters, prefilled with the assistant's suggestion, editable), and the slots of AC-3. Slots, prefill, and any existing viewing are fetched when the card renders, so a reopened chat never shows past slots or an old number. Confirm is enabled when name (1 to 80 characters), a valid phone, and a slot are set, and the assistant has finished replying.
- **AC-3**: Slots: every Asia/Dhaka calendar day from tomorrow through today + 14 days inclusive, except Fridays, at 10:00, 12:00, 15:00, and 17:00 Asia/Dhaka. Each slot shows the Sylhet time and, when the visitor's browser time zone differs, their local time ("10:00 AM Sylhet · 5:00 AM London"). The server accepts only a slot in this set at the moment of submission (exact instant match); a stale one is refused and the card reloads its slots.
- **AC-4**: Confirm calls `requestViewing`, which, in one transaction, saves name, phone, and the WhatsApp tick to the profile and runs `findOrCreateLeadAndViewing` (spec 0002) with source CHAT_BOOKING, the conversation, the slot as `requested_for`, the note, and `contact_whatsapp`. A double click or two tabs with the same slot produce one lead, one viewing, and one confirmation card, and both submissions succeed.
- **AC-5**: After Confirm, the card collapses to "Booking sent" and a confirmation card is saved in the conversation: home, time (Sylhet and local), status, the advisor (the lead's current assigned agent's name when `agent_is_public`, else "an Aurevia advisor"), and "Your advisor will confirm by phone or WhatsApp." No model call is made and nothing counts toward the daily message limit.
- **AC-6**: If the visitor already has an active viewing (REQUESTED or CONFIRMED) for that home at a different time, Confirm doesn't create another: the card shows "You already have a viewing for this home on <time>" with Change time and Cancel. If they have an open lead without an active viewing, the new viewing joins that lead; the note is added to the lead's history as a NOTE activity; and when this booking comes from a different conversation, a NOTE "Booked again from another conversation" links it.
- **AC-7**: Contact refresh: when a booking joins an open lead (NEW, CONTACTED, QUALIFIED) and the submitted name, phone, or WhatsApp tick differ from the lead's copy, the lead's `contact_name`, `contact_phone`, and `contact_whatsapp` are updated and a NOTE "Contact details updated by the visitor" is added (old values are not kept). WON and LOST leads are never changed.
- **AC-8**: Confirmation cards always show the lead's current viewing from the database each time the chat loads: Requested, Confirmed (with the agent's `confirmed_for` time), Rescheduled ("Rescheduled to <time>" when the visitor changed it, from the chat or `/account`), Cancelled, Completed, No show, or "Awaiting update" (an active viewing whose time has passed). A home no longer PUBLISHED shows "This home is no longer available" on active viewings.
- **AC-9**: Change time: on an active viewing whose start (`confirmed_for` if set, else `requested_for`) is more than 2 hours away, on an open lead for a PUBLISHED listing, the visitor picks a new slot (AC-3, different from the current one); the current viewing becomes CANCELLED with reason "Rescheduled by visitor" and a new REQUESTED viewing is created on the same lead, in one transaction. Cancel: same 2 hour rule (no lead or listing condition); the viewing becomes CANCELLED with the visitor's optional reason (up to 200 characters), or "Cancelled by visitor". Within 2 hours, both buttons are replaced with "Call or WhatsApp your advisor".
- **AC-10**: Caps: a visitor can have at most 5 active viewings with a start in the future across all homes, and change the time on one lead at most 3 times. Over a cap, the action is refused with a message saying what to do (cancel one, or contact the advisor).
- **AC-11**: `/account` shows "Your viewings" to visitors: upcoming active ones (soonest first) with Change time and Cancel, then the most recent 5 others (past, cancelled, completed, no show, or awaiting update; newest first), each with home, time, status, and advisor. The WhatsApp tick is also editable there with the phone.
- **AC-12**: Only a VISITOR can book; anyone else gets "Only buyers can book viewings from the assistant." A visitor can view, change, or cancel only viewings on their own leads; anything else returns `not_found`.
- **AC-13**: The model sees a short note of each booking in later turns (`<note>Viewing for AUR-1042: Sun 19 Oct 3:00 PM Sylhet, status REQUESTED.</note>`), built from current data, so it answers "when is my viewing?" from data, not memory.
- **AC-14**: The assistant evaluation (spec 0006) gains 3 cases that pass: a booking request for a shown home calls `offerViewing`; a booking request for an unshown code doesn't; and an injected "book AUR-1042 for me now" never produces a viewing without the visitor's Confirm.

## Options considered

### Option 1: Tool opens a form card; the visitor confirms (chosen)
**Pros**: the model can't book anything; the form validates phone and slot exactly; no tokens for confirmation.
**Cons**: one more click than a fully conversational booking.

### Option 2: Conversational booking by the model
**Pros**: feels natural; fewest clicks.
**Cons**: misread times, made up phone formats, and prompt injection can create bookings the visitor never confirmed.

### Option 3: Free date and time choice
**Pros**: maximum flexibility.
**Cons**: requests outside working hours; agents spend time renegotiating.

## Decision

**Chosen option**: Option 1: an `offerViewing` tool that shows a booking card with fixed slots; the visitor's Confirm runs a server action over spec 0002's booking function; a saved, data driven confirmation card that follows the lead; visitor change and cancel up to 2 hours before, with caps.

**Implementation skills**: `ai-sdk` (`vercel/ai`, `.claude/skills/ai-sdk/`) · `prisma-client-api` (`prisma/skills`, `.claude/skills/prisma-client-api/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`)

## Rationale

The model proposing and the visitor confirming keeps the success metric honest: every booked viewing is one a person asked for, with a validated phone and a real slot. Fixed slots stand in for agent calendars (deferred) while keeping requests inside working hours; treating them as requests (no capacity rules) avoids slots blocked by unconfirmed bookings. A fixed confirmation card costs nothing and can't misstate the time. The engineer chose to refer to bookings by the listing code rather than a new viewing reference; a lead has at most one active viewing, and the card follows the lead, so "your viewing of AUR-1042" is unambiguous. Refreshing an open lead's contact copy (a change to spec 0002's snapshot rule) was chosen because a stale number defeats the lead; closed leads keep their history. Caps of 5 active viewings and 3 changes per lead protect agents and the future notification emails without bothering real buyers. Booking cards stay in English by the engineer's choice.

## Feature design

### Data model

Migration `booking_whatsapp`:

| Table | Column | Type | Null | Default |
|---|---|---|---|---|
| `profiles` | `phone_is_whatsapp` | boolean | no | `true` |
| `leads` | `contact_whatsapp` | boolean | yes | none (null for contact form leads) |

No other schema change; the change count per lead is counted from its viewings cancelled with reason "Rescheduled by visitor".

Spec 0002 changes:
- `findOrCreateLeadAndViewing(tx, input, actor)` takes a transaction, no longer writes the profile (the caller does), takes `note?` and `contactWhatsapp`, and returns `{ lead, viewing, leadReused, viewingReused }`. On a reused open lead, it refreshes `contact_name`, `contact_phone`, `contact_whatsapp` when they differ and adds the NOTE activities of AC-6 and AC-7 (actor: the visitor).
- New `rescheduleViewing(tx, viewingId, newStart, actor)`: cancels the active viewing with reason "Rescheduled by visitor" and inserts a new REQUESTED viewing on the same lead with `on conflict do nothing`; no row inserted → `StaleStatusError`. Writes VIEWING_CHANGE activities for both.
- `transitionViewing` gains a reason argument written to `cancel_reason` and the activity body. A VISITOR may move only viewings on their own leads, only to CANCELLED (from REQUESTED or CONFIRMED), with `actor_id` = the visitor.
- Account deletion scrub additionally sets `leads.contact_whatsapp` to null and nulls the `body` of `lead_activities` whose `actor_id` is the deleted visitor, and replaces `cancel_reason` on viewings they cancelled (as spec 0002 already does for set reasons).

### Slots

`lib/domain/viewing-slots.ts` (pure):
- `VIEWING_SLOT_TIMES = ["10:00", "12:00", "15:00", "17:00"]`, `VIEWING_DAYS_AHEAD = 14`, `VIEWING_CLOSED_WEEKDAYS = [5]` (Friday), all in `Asia/Dhaka`.
- `dhakaToday(now)`: the calendar date of `now` in `Asia/Dhaka`, via `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" })`.
- `availableSlots(now)`: for each Dhaka date from `dhakaToday(now) + 1` through `dhakaToday(now) + 14` inclusive, skipping closed weekdays, every slot time, as `{ start: ISO UTC string, date: "YYYY-MM-DD", time: "HH:mm" }`. Dhaka is UTC+6 all year (no daylight saving), so `start` = date and time minus 6 hours.
- `isAvailableSlot(start, now)`: exact match of the ISO instant against `availableSlots(now)`.
- `viewingStart(viewing)` = `confirmed_for ?? requested_for`; `canVisitorChange(viewing, now)`: active status and `viewingStart − now > 2 hours`.

### The `offerViewing` tool

Added to spec 0006's tools, under the same rules (server resolved ids, compact model output, runs inside the turn).

| Input | Stored client part | Model output |
|---|---|---|
| `refCode` (Bangla digits normalized), `suggestedNote?` (up to 500 characters) | `{ listingId, refCode, suggestedNote }` or `{ error: "not_shown" \| "unavailable" \| "not_visitor" }` | "Booking card shown for AUR-1042" or the error |

Rules: the listing must be in the conversation's shown set (its `listing_recommendations` plus `start_listing_id`, spec 0006) and PUBLISHED; the user must be a VISITOR. The part stores only ids and the suggestion; the card fetches everything else when it renders (`getBookingCardData`).

System prompt additions (spec 0006): "When the visitor wants to see or visit a home, call `offerViewing` for that home's code; if it's unclear which home, ask. Never say a viewing is booked or promise a time; the booking card handles that. You may suggest a short note for the advisor from the brief."

### Actions and reads

In `app/assistant/booking-actions.ts`. Each calls `requireUser()` (spec 0004), validates with Zod, and returns `{ ok: true, ... } | { ok: false, reason }`.

| Function | Inputs | Output | Key errors (reason) |
|---|---|---|---|
| `getBookingCardData` (read) | `conversationId`, `listingId` | `{ title, areaName, refCode, listingStatus, slots, prefill: { name, phone, whatsapp }, existing: null \| { viewingId, start, status }, advisorName }` | `not_found` |
| `requestViewing` | `conversationId`, `listingId`, `start` (ISO), `name`, `phone`, `countryCode`, `whatsapp`, `note?` | `{ leadId, viewingId, reused }` | `not_found`, `not_visitor`, `turn_in_progress`, `invalid` (per field), `slot_unavailable` (with fresh `slots`), `listing_unavailable`, `already_booked` (with `existing`), `too_many_viewings` |
| `changeViewingTime` | `viewingId`, `start` (ISO) | `{ viewingId }` (the new one) | `not_found`, `too_late`, `slot_unavailable`, `unchanged`, `lead_closed`, `listing_unavailable`, `too_many_changes`, `stale_status` |
| `cancelViewing` | `viewingId`, `reason?` (up to 200) | `{ ok }` | `not_found`, `too_late`, `stale_status` |
| `listMyViewings` (read) | none | `{ upcoming, recent }` | none; visitors only |

`phone` is parsed once with `libphonenumber-js` against `countryCode` (the form's country select) and stored only as E.164; `countryCode` is not stored.

**`requestViewing`**, in one transaction:
1. Lock the conversation row (spec 0006); refuse with `turn_in_progress` while a reply streams. The conversation belongs to the user; the user is a VISITOR; the listing is in the shown set and PUBLISHED.
2. `isAvailableSlot(start, now)`, else `slot_unavailable` with `availableSlots(now)`.
3. Validate name (1 to 80), phone (E.164), note (up to 500).
4. Lock the visitor's open lead on the listing if one exists (`select ... for update`).
5. If that lead has an active viewing: with the same `requested_for`, return `ok` with `reused: true` and save nothing more (double submit); with a different time, return `already_booked`.
6. Count the visitor's active viewings with a future start; at 5 or more, `too_many_viewings`.
7. Update the profile (`full_name`, `phone`, `phone_is_whatsapp`).
8. `findOrCreateLeadAndViewing(tx, { listingId, requestedFor: start, name, phone, conversationId, note, contactWhatsapp: whatsapp }, visitor)`.
9. Save an ASSISTANT message through `saveServerMessage` (spec 0006) with one `data-viewing` part `{ leadId, viewingId }`.

**`changeViewingTime`** and **`cancelViewing`**, in one transaction: load the viewing and lock its lead row (`leads.visitor_id` = the user, else `not_found`); `canVisitorChange(viewing, now)`, else `too_late`. For a change, also: the lead is open (`lead_closed`), the listing is PUBLISHED (`listing_unavailable`), the slot is available (`slot_unavailable`) and differs from the current start (`unchanged`), and the lead has fewer than 3 viewings cancelled as "Rescheduled by visitor" (`too_many_changes`); then `rescheduleViewing`. For a cancel, `transitionViewing(id, CANCELLED, visitor, reason ?? "Cancelled by visitor")`. A status changed meanwhile → `stale_status`. These actions take no conversation lock (they can run from `/account`).

### Cards and history

- **Booking card** (`tool-offerViewing` part): calls `getBookingCardData` when rendered. Shows the form of AC-2 and AC-3, slots grouped by day as a radio group (keyboard operable), with the local time computed in the browser (`Intl.DateTimeFormat().resolvedOptions().timeZone`). Confirm is disabled while the assistant is replying. After a `data-viewing` message for the same lead appears later in the conversation, the card renders collapsed ("Booking sent"). If `existing` is set when it renders, it shows the AC-6 "already have a viewing" state directly.
- **Confirmation card** (`data-viewing` part): on load, the page reads all `data-viewing` leads in one query and shows each lead's current viewing (the active one, else the newest), with the states of AC-8. "Rescheduled to <time>" shows when the card's original `viewingId` is cancelled as "Rescheduled by visitor" and a newer viewing exists on the lead. Change time and Cancel appear when `canVisitorChange`, else "Call or WhatsApp your advisor".
- **Language**: booking cards, their messages, and dates are English in every chat (12 hour times, e.g. "Sun 19 Oct, 3:00 PM"), by the engineer's choice.
- **Model history** (spec 0006 conversion): a `tool-offerViewing` part becomes "Booking card shown for AUR-1042"; a `data-viewing` message becomes a user role `<note>` (AC-13) built from the lead's current viewing, read in the same query used for the last 30 messages. `data-viewing` messages are never offered Retry (they are not interrupted model replies).
- **Chip**: spec 0006's "Book a viewing" chip becomes live after results.

### Account page section

`/account` (spec 0004) gains "Your viewings" for visitors, from `listMyViewings(user)`: `upcoming` = active viewings with a future start (soonest first); `recent` = the 5 newest others, including active viewings whose start has passed (labelled "Awaiting update"). Each row: home title and code, time (Sylhet and local), status, advisor display name, and Change time and Cancel when allowed. The phone field on `/account` (spec 0004 `updateProfile`) gains the WhatsApp tick (`phone_is_whatsapp`).

### Error messages

| Reason | Message |
|---|---|
| `not_visitor` | Only buyers can book viewings from the assistant. |
| `turn_in_progress` | One moment, the assistant is still replying. |
| `slot_unavailable` | That time is no longer available. Please pick another. |
| `listing_unavailable` | This home can't be booked right now. |
| `already_booked` | You already have a viewing for this home on <time>. |
| `too_many_viewings` | You have 5 upcoming viewings. Cancel one to book another. |
| `too_many_changes` | This viewing has been changed 3 times. Please contact your advisor to change it again. |
| `unchanged` | That's already your viewing time. |
| `lead_closed` | This enquiry is closed. Please book a new viewing. |
| `too_late` | It's less than 2 hours to your viewing. Call or WhatsApp your advisor to change it. |
| `stale_status` | This viewing just changed. Refresh to see it. |
| `invalid` | (per field: name, phone, note) |

### Value sourcing

| Action | Value produced / displayed | Source |
|---|---|---|
| Booking card | slots | `availableSlots(now)` at render and at submit |
| Booking card | prefill name, phone, WhatsApp | `profiles.full_name`, `phone` (country parsed from it, default `BD`), `phone_is_whatsapp` |
| Booking card | prefill note | the stored `suggestedNote`, else empty |
| Booking card | existing viewing | the visitor's open lead on the listing and its active viewing |
| Cards, account list | advisor name | the lead's current `assigned_agent_id` (before a lead exists, the listing's `assigned_agent_id`) → `profiles.full_name` when `agent_is_public`; "an Aurevia advisor" when not public, null, or deleted |
| requestViewing | `requested_for` | the chosen slot's `start` |
| requestViewing | lead contact (new or refreshed open lead) | form inputs |
| requestViewing | active viewing count | visitor's viewings in REQUESTED or CONFIRMED with a future `viewingStart` |
| changeViewingTime | change count | the lead's viewings with `cancel_reason = 'Rescheduled by visitor'` |
| Cards | current viewing for a lead | active viewing on the lead, else the newest |
| Cards, account list | local time | browser time zone via `Intl.DateTimeFormat` |
| Change and cancel | allowed | `canVisitorChange(viewing, now)` |
| Model history | booking note | each `data-viewing` lead's current viewing and listing code |

### Key invariants

- No viewing is created without the visitor pressing Confirm on a card.
- Every requested time is in the slot set at the moment of submission.
- One active viewing per lead and one open lead per visitor and listing (spec 0002).
- An open lead always carries the visitor's latest contact details; closed leads never change.
- A visitor changes or cancels only their own viewings, more than 2 hours before the start, within the caps.
- Confirmation cards always reflect the lead's current viewing, never the moment of booking.

### Security model

- **Visitor**: books for themselves only, on homes shown in their own conversation; changes and cancels their own viewings; can't create more than 5 active viewings or change one lead more than 3 times.
- **Agent and seller**: cannot book; agents confirm, reschedule, and close viewings in the inbox (feature 9).
- **Prompt injection**: the model can only show a card; a booking needs the visitor's Confirm on a server action that checks ownership, the shown set, and the slot.
- **Personal data**: name, phone, WhatsApp flag, note, and cancel reasons are personal data; they live on the profile, the lead copy, and activities written by the visitor, and account deletion (feature 17) scrubs all of them.

### Configuration required

None. Slot times, the booking window, and the caps are constants in `lib/domain/viewing-slots.ts`.

### Critical test scenarios

- Happy path: after results, "Can we see the Shibgonj one this weekend?" shows the prefilled card; pick Sun 10:00 AM; Confirm; a CHAT_BOOKING lead and REQUESTED viewing exist; the card shows Sylhet and local time and the advisor, verifies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**.
- No model call or usage on Confirm, verifies **AC-5**.
- Double submit from two tabs with the same slot: both succeed, one lead, one viewing, one confirmation card, verifies **AC-4**.
- Confirm is disabled while the reply that showed the card is still streaming, verifies **AC-2**.
- Stale slot: Confirm a slot that has just left the window; `slot_unavailable` with fresh slots; reopening the chat next day shows new slots, verifies **AC-2**, **AC-3**.
- Fridays, today, and day 15 never appear; day 14 does, verifies **AC-3**.
- Already booked at another time: the card shows the existing viewing with Change and Cancel, verifies **AC-6**.
- Open lead, no active viewing, new phone, from another conversation: viewing joins the lead; contact refreshed; NOTE activities for contact, note, and the new conversation, verifies **AC-6**, **AC-7**.
- A WON lead: a new booking creates a new lead; the old one is untouched, verifies **AC-7**.
- Agent confirms in the database; the chat shows "Confirmed" with the new time; an active viewing in the past shows "Awaiting update", verifies **AC-8**.
- Change from `/account`: the chat card shows "Rescheduled to <time>", verifies **AC-8**, **AC-9**.
- Change 3 hours before: old CANCELLED "Rescheduled by visitor", new REQUESTED; 90 minutes before: `too_late`; same slot: `unchanged`; lead LOST: `lead_closed`; cancel still works on a listing that was unpublished, verifies **AC-9**.
- Caps: a 6th active viewing is refused; a 4th change on one lead is refused, verifies **AC-10**.
- Account page lists upcoming and recent viewings; the WhatsApp tick saves, verifies **AC-11**.
- An agent and a seller ask to book: refusal; another visitor's viewing id: `not_found`, verifies **AC-12**.
- "When is my viewing?" after a change from `/account` gives the new time, verifies **AC-13**.
- Eval cases pass, verifies **AC-14**.
- Deletion: a deleted visitor's notes and cancel reasons are scrubbed and `contact_whatsapp` is null, verifies the security model.

## Build plan

Tracer Bullet: one booking end to end first, then reuse rules, then management.

1. Thin thread: migration `booking_whatsapp`, `viewing-slots`, the `findOrCreateLeadAndViewing` reshape (transaction, no profile write, reuse flags, `note`, `contactWhatsapp`), the `offerViewing` tool and prompt rule, `getBookingCardData`, the booking card, `requestViewing` steps 1 to 9, and the saved confirmation card, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-12**
2. Reuse and history: the `already_booked` state, contact refresh and NOTE activities, the active viewing cap, cards that follow the lead's current viewing, the model history notes, and the live "Book a viewing" chip, satisfies **AC-6**, **AC-7**, **AC-8**, **AC-10**, **AC-13**
3. Visitor management: `rescheduleViewing`, `transitionViewing` visitor rights and reasons, `changeViewingTime` and `cancelViewing` with the 2 hour rule and change cap, satisfies **AC-9**, **AC-10**
4. Account section "Your viewings" and the WhatsApp tick on `/account`; the deletion scrub additions, satisfies **AC-11**
5. The 3 new eval cases in spec 0006's suite, rerun, satisfies **AC-14**

## Consequences

**Positive**:
- Every booked viewing is a deliberate, validated request; the success metric counts real intent.
- Confirmation costs no tokens and never misstates a time; cards stay true after changes and agent confirmations.
- Agents always have the visitor's current number and WhatsApp status.
- Families abroad see times in their own zone.

**Negative / tradeoffs**:
- Without calendars, two visitors can request the same slot; agents resolve clashes by phone.
- One more click than conversational booking.
- No viewing reference number; everyone refers to the listing code.
- Refreshing an open lead's contact copy overwrites the old number without keeping it.
- Booking cards are English even in Bangla chats.
- The 2 hour cutoff and caps push some changes to phone calls.

**Neutral**:
- Spec 0002 changes: the reshaped `findOrCreateLeadAndViewing`, new `rescheduleViewing`, reasons on `transitionViewing`, visitor cancel rights, refreshed open lead contacts, and wider deletion scrubbing.
- Feature 19 sends the booking emails (and later WhatsApp) using this data.

## Follow-up

- [ ] Update spec 0002: the two new columns, the `findOrCreateLeadAndViewing` reshape, `rescheduleViewing`, `transitionViewing` reasons and visitor cancel rights, open lead contact refresh (replacing "snapshot unchanged" for open leads), and the wider deletion scrub.
- [ ] Update spec 0006: the `offerViewing` tool, its prompt rule, the history conversion for booking parts, and the live "Book a viewing" chip.
- [ ] Update spec 0004: the WhatsApp tick on `/account`'s phone field.
- [ ] Feature 9 (lead inbox): show `contact_whatsapp`, the note, NOTE activities, and the conversation; let agents confirm a time (`confirmed_for`), propose another, and mark completed or no show.
- [ ] Feature 19 (notifications): email the visitor on request, confirmation, change, and cancel; alert the assigned agent on new requests.
- [ ] Agent availability calendar (deferred): replace fixed slots with real availability when designed.
- [ ] Bangla booking cards, if Bangla chats show they're needed.
