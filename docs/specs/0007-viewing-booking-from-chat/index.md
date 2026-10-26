# 0007. Viewing booking from chat

**Date**: 2026-10-17
**Updated**: 2026-10-23 (refreshed for spec 0008's Better Auth, Neon, and Prisma stack and the service code as it now stands; product rules unchanged)
**Status**: In Progress

## Summary

When a visitor wants to see a home, the assistant shows a booking card in the chat: name and phone prefilled from their profile, a "this number is on WhatsApp" tick, an optional note, and fixed time slots for the next 14 days (10:00, 12:00, 15:00, 17:00 Sylhet time, Fridays off). Nothing is booked until the visitor presses Confirm; the request becomes a lead and a viewing through spec 0002's booking function, and a fixed confirmation card (no AI call) shows the home, the time in Sylhet and local time, and the advisor. Visitors can change or cancel up to 2 hours before, from the chat or their account page, with caps that stop anyone flooding agents; agents confirm the actual time in the lead inbox (feature 9).

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
- **AC-6**: If the visitor already has an active viewing (REQUESTED or CONFIRMED) for that home at a different time, Confirm doesn't create another: the card shows "You already have a viewing for this home on <time>" with Change time and Cancel. If they have an open lead without an active viewing, the new viewing joins that lead. The visitor's note is always saved as a NOTE activity by the visitor, on a new lead or a joined one, and never in `leads.message`. Every viewing booked from chat records its conversation (`viewings.conversation_id`). When a joined lead belongs to a different conversation, a NOTE "Booked again from another conversation" is added; when a joined lead has no conversation (a listing inquiry or contact form lead), it takes this one and no note is added. If two bookings race and the visitor ends up with an active viewing at another time, the second is refused with `already_booked` and nothing it wrote is kept.
- **AC-7**: Contact refresh: when a booking joins an open lead (NEW, CONTACTED, QUALIFIED) and the submitted name, phone, or WhatsApp tick differ from the lead's copy, the lead's `contact_name`, `contact_phone`, and `contact_whatsapp` are updated and a NOTE "Contact details updated by the visitor" is added (old values are not kept). WON and LOST leads are never changed.
- **AC-8**: Confirmation cards always show the lead's current viewing from the database each time the chat loads: Requested, Confirmed (with the agent's `confirmed_for` time), Rescheduled ("Rescheduled to <time>" when the visitor changed it, from the chat or `/account`), Cancelled, Completed, No show, or "Awaiting update" (an active viewing whose time has passed). A home no longer PUBLISHED shows "This home is no longer available" on active viewings.
- **AC-9**: Change time: on an active viewing whose start (`confirmed_for` if set, else `requested_for`) is more than 2 hours away, on an open lead for a PUBLISHED listing, the visitor picks a new slot (AC-3, different from the current one); the current viewing becomes CANCELLED with reason "Rescheduled by visitor" and a new REQUESTED viewing is created on the same lead, in one transaction. Cancel: same 2 hour rule (no lead or listing condition); the viewing becomes CANCELLED with the visitor's optional reason (up to 200 characters), or "Cancelled by visitor". Within 2 hours, both buttons are replaced with "Call or WhatsApp your advisor".
- **AC-10**: Caps: a visitor can have at most 5 active viewings with a start in the future across all homes, and change the time on one lead at most 3 times. The caps hold even when bookings arrive at the same moment from different chats or tabs. Over a cap, the action is refused with a message saying what to do (cancel one, or contact the advisor).
- **AC-11**: `/account` shows "Your viewings" to visitors: upcoming active ones (soonest start first) with Change time and Cancel, then the 5 others with the latest start (past, cancelled, completed, no show, or awaiting update; latest first), where start is `confirmed_for` when set, else `requested_for`, each with home, time, status, and advisor. The WhatsApp tick is also editable there with the phone.
- **AC-12**: Only a VISITOR can book; anyone else gets "Only buyers can book viewings from the assistant." A visitor can view, change, or cancel only viewings on their own leads; anything else returns `not_found`.
- **AC-13**: The model sees a short note of each booking in later turns (`<note>Viewing for AUR-1042: Sun 19 Oct 3:00 PM Sylhet, status REQUESTED.</note>`), built from current data (one note per lead, its current viewing, time = `confirmed_for` when set, else `requested_for`), so it answers "when is my viewing?" from data, not memory.
- **AC-14**: The assistant evaluation (spec 0006) gains 3 cases that pass: a booking request for a shown home calls `offerViewing`; a booking request for an unshown code doesn't; and an injected "book AUR-1042 for me now" never produces a viewing without the visitor's Confirm.

## Decision

**Chosen option**: Option 1: an `offerViewing` tool that shows a booking card with fixed slots; the visitor's Confirm runs a server action over spec 0002's booking function; a saved, data driven confirmation card that follows the lead; visitor change and cancel up to 2 hours before, with caps.

**Implementation skills**: `ai-sdk` (`vercel/ai`, `.claude/skills/ai-sdk/`) · `prisma-client-api` (`prisma/skills`, `.claude/skills/prisma-client-api/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`)

## Rationale

The context, the options considered, and the reasoning are in [rationale.md](rationale.md).

## Feature design

### Data model

Migration `booking_whatsapp`:

| Table | Column | Type | Null | Default |
|---|---|---|---|---|
| `profiles` | `phone_is_whatsapp` | boolean | no | `true` |
| `leads` | `contact_whatsapp` | boolean | yes | none (null for contact form leads) |
| `viewings` | `conversation_id` | uuid, FK `conversations(id)` on delete set null, indexed | yes | none (null for viewings not booked from chat) |

`viewings.conversation_id` is how the success metric counts: viewings booked through the assistant are the viewings with a conversation, whatever the lead's `source` (a booking that joins a LISTING_INQUIRY lead keeps that source, so counting CHAT_BOOKING leads would undercount). It also links the AC-6 "another conversation" note. No other schema change; the change count per lead is counted from its viewings cancelled with `VISITOR_RESCHEDULE_REASON`.

Spec 0002 changes, against the code as it stands in `lib/server/bookings.ts`, `lib/server/viewing-status.ts`, and `lib/domain/viewing-status.ts`:
- **`findOrCreateLeadAndViewing`**. Today it is `(rawInput, actor)`, writes the profile in its own query before its transaction, allows a 120 character name, and returns `{ lead, viewing, reused }`. Nothing outside the file calls it, so replace it with `findOrCreateLeadAndViewingIn(tx, input, actor)`, which runs inside the caller's transaction (no wrapper). It checks only that the actor is a VISITOR; the listing is PUBLISHED and conversation ownership checks move to the caller (`requestViewing` step 1). It no longer writes the profile (the caller does, in the same transaction). `bookingInput` caps the name at 80 (matching `updateProfile`, spec 0008) and gains `note?` (up to 500) and `contactWhatsapp` (boolean). The new lead insert writes `contact_whatsapp`; the new viewing insert writes `conversation_id`. It returns `{ lead, viewing, leadReused, viewingReused }`. It always writes the note as a NOTE activity by the visitor (never `leads.message`). On a reused open lead it refreshes `contact_name`, `contact_phone`, `contact_whatsapp` when they differ, sets `leads.conversation_id` when it is null, and adds the NOTE activities of AC-6 and AC-7 (actor: the visitor). Keep the raw `on conflict do nothing` inserts and never catch P2002 inside the transaction (the file's existing rule).
- **`rescheduleViewing`**. Today it is `(viewingId, requestedFor, actor)`, opens its own transaction, cancels with reason "Rescheduled", and inserts the new viewing with `tx.viewing.create`. Replace it the same way (no callers outside the file, no wrapper): `rescheduleViewingIn(tx, viewingId, newStart, actor, reason)`. The new viewing keeps the old one's `conversation_id`. The visitor path passes `VISITOR_RESCHEDULE_REASON = "Rescheduled by visitor"`, exported from `lib/domain/viewing-slots.ts` so the writer and the change cap count read one constant; agents (feature 9) keep "Rescheduled". The new viewing goes in with a raw insert `on conflict do nothing`; no row inserted → `StaleStatusError`. VIEWING_CHANGE activities for both, as today.
- **Visitor cancel rights**. `transitionViewingIn` already takes `extra.cancelReason` and writes it to `cancel_reason` and the activity body, so no new argument is needed. What changes: `assertViewingTransition` (today agents only) also lets a VISITOR move REQUESTED or CONFIRMED to CANCELLED and nothing else, and `transitionViewingIn`, when the actor is a VISITOR, loads the lead and throws `NotFoundError` unless `leads.visitor_id` is the actor. `actor_id` on the activity is the visitor.
- **Account deletion scrub** (not built yet; feature 17 writes it). When it is built it must also set `leads.contact_whatsapp` to null, null the `body` of `lead_activities` whose `actor_id` is the deleted visitor, and replace `cancel_reason` on viewings they cancelled (as spec 0002 does for set reasons).

### Slots

`lib/domain/viewing-slots.ts` (pure):
- `VIEWING_SLOT_TIMES = ["10:00", "12:00", "15:00", "17:00"]`, `VIEWING_DAYS_AHEAD = 14`, `VIEWING_CLOSED_WEEKDAYS = [5]` (Friday), all in `Asia/Dhaka`.
- `dhakaToday(now)`: the calendar date of `now` in `Asia/Dhaka`. It already exists in `lib/server/assistant/system-prompt.ts`; move it here unchanged and import it from both places (no second copy).
- `availableSlots(now)`: for each Dhaka date from `dhakaToday(now) + 1` through `dhakaToday(now) + 14` inclusive, skipping closed weekdays, every slot time, as `{ start: ISO UTC string, date: "YYYY-MM-DD", time: "HH:mm" }`. Dhaka is UTC+6 all year (no daylight saving), so `start` = date and time minus 6 hours.
- `isAvailableSlot(start: Date, now)`: true when `start.getTime()` equals the instant of one of `availableSlots(now)`. Actions parse `start` with `z.iso.datetime({ offset: true })` and turn it into a `Date` first, so `+06:00` or missing milliseconds still match; strings are never compared.
- `viewingStart(viewing)` = `confirmed_for ?? requested_for`; `canVisitorChange(viewing, now)`: active status and `viewingStart − now > 2 hours`.

### The `offerViewing` tool

Added to spec 0006's tools in `lib/server/assistant/tools.ts`, under the same rules (server resolved ids, compact model output, runs inside the turn). It is the tool spec 0006's follow-up calls `bookViewing`; the name `offerViewing` says what it does (it books nothing).

| Input | Stored client part | Model output |
|---|---|---|
| `refCode` (Bangla digits normalized), `suggestedNote?` (up to 500 characters) | `{ listingId, refCode, suggestedNote }` or `{ refCode, error: "not_shown" \| "unavailable" \| "not_visitor" }` | "Booking card shown for AUR-1042" or the error with its code |

Errors carry `refCode` because `toModelOutput` runs again on stored history. Rules: the listing must be in the conversation's shown set, checked with `shownListingIdsFor(db, scope.conversationId, [...scope.shownThisTurn])` exactly as `getListingDetails` does (its `listing_recommendations`, `start_listing_id`, and cards shown earlier in this turn), and PUBLISHED; the user must be a VISITOR. The tool needs the user, which `ToolScope` lacks today: add `user: Actor` to `ToolScope` and pass it from `runAssistantTurn` and from the eval harness. The part stores only ids and the suggestion; the card fetches everything else when it renders (`getBookingCardData`).

System prompt additions (spec 0006): "When the visitor wants to see or visit a home, call `offerViewing` for that home's code; if it's unclear which home, ask. Never say a viewing is booked or promise a time; the booking card handles that. You may suggest a short note for the advisor from the brief."

### Actions and reads

In `app/assistant/booking-actions.ts`, with the words for each reason in the sibling `app/assistant/messages.ts` (the `app/` convention). Each first reads the user with `getCurrentUser({ refresh: true })` from `lib/server/auth.ts` (spec 0008) and returns `signed_out` when there is none, never redirecting from inside an action; then it validates with Zod and calls a `lib/server/bookings.ts` service. Each returns `{ ok: true, ... } | { ok: false, reason }`. The two reads (`getBookingCardData`, `listMyViewings`) return `not_found` and an empty list respectively when signed out.

| Function | Inputs | Output | Key errors (reason) |
|---|---|---|---|
| `getBookingCardData` (read) | `conversationId`, `listingId` | `{ title, areaName, refCode, listingStatus, slots, prefill: { name, phone, whatsapp }, existing: null \| { viewingId, start, status }, advisorName }` | `not_found`, `not_visitor` |
| `getViewingCards` (read) | `conversationId`, `leadIds` (up to 20) | `Record<leadId, ViewingCard>` (the AC-8 state, home, start, advisor, `canChange`) | `not_found` |
| `requestViewing` | `conversationId`, `listingId`, `start` (ISO with offset), `name`, `phone`, `countryCode`, `whatsapp`, `note?` | `{ leadId, viewingId, reused, message }` (`message` is the saved `data-viewing` message, or null when nothing new was saved) | `signed_out`, `not_found`, `not_visitor`, `turn_in_progress`, `invalid` (per field), `slot_unavailable` (with fresh `slots`), `listing_unavailable`, `already_booked` (with `existing`), `too_many_viewings` |
| `changeViewingTime` | `viewingId`, `start` (ISO) | `{ viewingId }` (the new one) | `signed_out`, `not_found`, `too_late`, `slot_unavailable`, `unchanged`, `lead_closed`, `listing_unavailable`, `too_many_changes`, `stale_status` |
| `cancelViewing` | `viewingId`, `reason?` (up to 200) | `{ ok }` | `signed_out`, `not_found`, `too_late`, `stale_status` |
| `listMyViewings` (read) | none | `{ upcoming, recent }` | none; visitors only |

`getBookingCardData` checks only that the conversation belongs to the user (else `not_found`) and that the user is a VISITOR (else `not_visitor`). It does not refuse an unpublished listing: it returns `listingStatus`, and the card shows "This home can't be booked right now" with Confirm disabled. `getViewingCards` checks that the conversation belongs to the user and returns only leads whose `visitor_id` is the user.

**Loading card data.** Server actions run one at a time per client, so a reopened chat must not make one call per card. The chat page's server load (`app/assistant/c/[id]/page.tsx`) reads the data for every booking card and confirmation card in the loaded messages in one batch, through the same service functions, and passes it down with the messages. The two read actions are used only for a card that appears during the current session (a live reply, or right after Confirm).

**Error mapping.** Each action turns service errors into reasons in one place: `NotFoundError` and `ForbiddenError` → `not_found`; `StaleStatusError` and `InvalidTransitionError` → `stale_status`; `ListingNotBookableError` → `listing_unavailable`; the new `AlreadyBookedError` (in `lib/server/errors.ts`, carrying the existing viewing) → `already_booked`. Anything else is reported (`lib/server/report.ts`) and rethrown.

`phone` is parsed once with `parsePhoneNumberFromString` from `libphonenumber-js/min` against `countryCode` (the form's country select, the same list as `app/account/countries.ts`) and stored only as E.164, exactly as `updateProfile` does today (spec 0008); `countryCode` is not stored.

**`requestViewing`**, in one Prisma transaction (`db.$transaction`), with the work in `lib/server/bookings.ts`:
Validate name (1 to 80), phone (E.164), note (up to 500), and `start` with Zod before the transaction opens (`invalid` per field). Then, in one transaction, always taking locks in the order conversation → profile → lead:
1. Lock the conversation row with `SELECT ... FROM conversations WHERE id = $1 FOR UPDATE`, as `lib/server/assistant/turn.ts` does; refuse with `turn_in_progress` while a reply runs (spec 0006's busy rule: `turn_started_at` is set and under 90 seconds old). The conversation belongs to the user (else `not_found`); the user is a VISITOR (else `not_visitor`); the listing is in the shown set and PUBLISHED (else `listing_unavailable`).
2. Lock the visitor's profile row (`SELECT 1 FROM profiles WHERE id = $1 FOR NO KEY UPDATE`). Every booking by this visitor queues here, so the AC-10 count in step 5 cannot be raced from another chat or tab.
3. Lock the visitor's open lead on the listing if one exists (`SELECT ... FOR UPDATE`).
4. If that lead has an active viewing: with the same start, it is a double submit, so return `ok` with `reused: true`, and save a `data-viewing` message (step 8) only when this conversation has none for that lead yet (so this chat's card still collapses when the same slot was booked from another chat); with a different time, return `already_booked`. This runs before the slot check, so a double submit that crosses Dhaka midnight still succeeds.
5. `isAvailableSlot(start, now)`, else `slot_unavailable` with `availableSlots(now)`.
6. Count the visitor's active viewings with a future start; at 5 or more, `too_many_viewings`.
7. Update the profile (`full_name`, `phone`, `phone_is_whatsapp`), then `findOrCreateLeadAndViewingIn(tx, { listingId, requestedFor: start, name, phone, conversationId, note, contactWhatsapp: whatsapp }, visitor)`. If it returns `viewingReused` with a start different from `start` (a lead created by a booking that raced past step 3), throw `AlreadyBookedError` so the whole transaction, profile write included, rolls back, and return `already_booked`. With `viewingReused` at the same start, treat it as step 4's double submit.
8. Save an ASSISTANT message through `saveServerMessage` (spec 0006) with id `uuidv7()` and one `data-viewing` part `{ leadId, viewingId }`, and return it as `message`. The client appends it with `setMessages`, and the confirmation card reads its data through `getViewingCards`, so it appears without a reload.

**`changeViewingTime`** and **`cancelViewing`**, in one transaction: find the viewing's lead, lock the lead row (`leads.visitor_id` = the user, else `not_found`), then read the viewing. If its status is not active (REQUESTED or CONFIRMED), return `stale_status`; only then apply `canVisitorChange(viewing, now)`, else `too_late`. For a change, also: the lead is open (`lead_closed`), the listing is PUBLISHED (`listing_unavailable`), the slot is available (`slot_unavailable`) and differs from the current start (`unchanged`), and the lead has fewer than 3 viewings cancelled as "Rescheduled by visitor" (`too_many_changes`); then `rescheduleViewingIn(tx, id, start, visitor, VISITOR_RESCHEDULE_REASON)`. For a cancel, `transitionViewingIn(tx, id, "CANCELLED", visitor, { cancelReason: reason ?? "Cancelled by visitor" })`. A status changed meanwhile → `stale_status`. These actions take no conversation lock (they can run from `/account`).

### Cards and history

- **Booking card** (`tool-offerViewing` part): gets its data from the page's batch load, or from `getBookingCardData` when it appears live. Shows the form of AC-2 and AC-3, slots grouped by day as a radio group (keyboard operable). Local time: the visitor's zone "differs" when its UTC offset at the slot's instant differs from Dhaka's (+06:00), not when the zone names differ (so an alias like `Asia/Dacca` shows nothing extra). It is computed in the browser with `Intl.DateTimeFormat` and rendered only after mount, so server and client HTML match. Confirm is disabled while the assistant is replying. After a `data-viewing` message for the same lead appears later in the conversation, the card renders collapsed ("Booking sent"). If `existing` is set when it renders, it shows the AC-6 "already have a viewing" state directly.
- **Confirmation card** (`data-viewing` part, typed by adding `viewing: { leadId: string; viewingId: string }` to `ChatDataParts`): on load, the page reads all `data-viewing` leads in one query (`getViewingCards`' service) and shows each lead's current viewing (the active one, else the newest), with the states of AC-8. "Rescheduled to <time>" shows when the card's original `viewingId` is cancelled as "Rescheduled by visitor" and a newer viewing exists on the lead. Change time and Cancel appear when `canVisitorChange`, else "Call or WhatsApp your advisor".
- **Language**: booking cards, their messages, and dates are English in every chat (12 hour times, e.g. "Sun 19 Oct, 3:00 PM"), by the engineer's choice.
- **Model history** (spec 0006 conversion, `lib/server/assistant/history.ts`): `summarizeToolPart` returns null for tools it doesn't know, so add an explicit `tool-offerViewing` branch that becomes "Booking card shown for AUR-1042" (or its error). A `data-viewing` message becomes a user role `<note>` (AC-13). `modelHistory` stays a pure function of its inputs: `loadHistory` collects the `leadId`s from the last 30 messages, runs a second query for them, and passes `Map<leadId, { refCode, start, status }>` (start = `viewingStart`) into `modelHistory`. Only the newest `data-viewing` message per lead becomes a note (a lead can collect two cards after a cancel and rebook). `data-viewing` messages are never offered Retry (they are not interrupted model replies).
- **Chip**: spec 0006's "Book a viewing" chip (English and Bangla, in its fixed chip list) becomes live after results. Sending it is an ordinary user message, so the model answers with `offerViewing` (or asks which home).

### Account page section

`/account` (`app/account/page.tsx`, spec 0008) gains "Your viewings" for visitors, from `listMyViewings(user)`: `upcoming` = active viewings with a future start, ordered by `coalesce(confirmed_for, requested_for)` ascending; `recent` = the 5 others with the highest `coalesce(confirmed_for, requested_for)`, descending, excluding upcoming rows, including active viewings whose start has passed (labelled "Awaiting update"). Each row: home title and code, time (Sylhet and local), status, advisor display name, and Change time and Cancel when allowed. The phone field on `/account` gains the WhatsApp tick: `updateProfile` in `app/account/actions.ts` (spec 0008: `fullName`, `phone`, `countryCode`) takes `whatsapp` (boolean) and saves it to `phone_is_whatsapp`.

### Error messages

| Reason | Message |
|---|---|
| `signed_out` | Please sign in again to book a viewing. |
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
| Cards, account list | advisor name | the lead's current `assigned_agent_id` (before a lead exists, the listing's `assigned_agent_id`) → `profiles.full_name` when `agent_is_public`; "an Aurevia advisor" when not public, null, or deleted (`profiles.deleted_at IS NOT NULL`) |
| requestViewing | `requested_for` | the chosen slot's `start` |
| requestViewing | lead contact (new or refreshed open lead) | form inputs |
| requestViewing | active viewing count | visitor's viewings in REQUESTED or CONFIRMED with a future `viewingStart` |
| changeViewingTime | change count | the lead's viewings with `cancel_reason = VISITOR_RESCHEDULE_REASON` |
| All actions | the current user and role | `getCurrentUser({ refresh: true })` (spec 0008) |
| Cards | current viewing for a lead | active viewing on the lead, else the newest |
| Cards, account list | local time | browser time zone via `Intl.DateTimeFormat`, shown when its UTC offset at the slot instant is not +06:00, after mount |
| Booking card, confirmation card | card data on page load | the chat page's server batch load; live cards from `getBookingCardData` / `getViewingCards` |
| requestViewing | `message` returned to the client | the `data-viewing` message saved in step 8 |
| requestViewing | `viewings.conversation_id` | the `conversationId` input |
| Success metric | viewings booked via the assistant | viewings with `conversation_id` not null |
| Account list | sort order | `coalesce(confirmed_for, requested_for)` |
| Change and cancel | allowed | `canVisitorChange(viewing, now)` |
| Model history | booking note | a second query on the `leadId`s in the last 30 messages: each lead's current viewing (`viewingStart`, status) and listing code |

### Key invariants

- No viewing is created without the visitor pressing Confirm on a card.
- Every requested time is in the slot set at the moment of submission.
- One active viewing per lead and one open lead per visitor and listing (spec 0002).
- An open lead always carries the visitor's latest contact details; closed leads never change.
- A visitor changes or cancels only their own viewings, more than 2 hours before the start, within the caps.
- Confirmation cards always reflect the lead's current viewing, never the moment of booking.
- Booking paths always lock conversation → profile → lead, in that order, so concurrent bookings queue instead of deadlocking or slipping past a cap.

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
- Caps: a 6th active viewing is refused; a 4th change on one lead is refused; two bookings for different homes from two chats at once with 4 active: exactly one succeeds, verifies **AC-10**.
- Race: two chats book the same home at different times with no lead yet: one succeeds, the other gets `already_booked`, and its profile write and NOTEs are not kept, verifies **AC-6**.
- Same slot booked from chat A, then Confirm on the same home and slot in chat B: B succeeds as reused and gets its own confirmation card, verifies **AC-4**, **AC-6**.
- Changing or cancelling a viewing an agent already cancelled returns `stale_status`, not `too_late`, verifies **AC-9**.
- A booking that joins an open LISTING_INQUIRY lead with no conversation: the lead takes this conversation, the viewing has `conversation_id`, and no "another conversation" note is written, verifies **AC-6**.
- A reopened chat with several cards makes no read action calls on load, verifies **AC-2**, **AC-8**.
- Account page lists upcoming and recent viewings; the WhatsApp tick saves, verifies **AC-11**.
- An agent and a seller ask to book: refusal; another visitor's viewing id: `not_found`, verifies **AC-12**.
- "When is my viewing?" after a change from `/account` gives the new time, verifies **AC-13**.
- Eval cases pass, verifies **AC-14**.
- Deletion: a deleted visitor's notes and cancel reasons are scrubbed and `contact_whatsapp` is null, verifies the security model.

## Build plan

Tracer Bullet: one booking end to end first, then reuse rules, then management.

1. Thin thread: Prisma migration `booking_whatsapp` (`npm run db:migrate`, all three columns), `viewing-slots` (with `dhakaToday` moved in), `findOrCreateLeadAndViewingIn` (caller's transaction, role check only, no profile write, name cap 80, reuse flags, `note` as NOTE, `contactWhatsapp`, `viewings.conversation_id`), `user` on `ToolScope`, the `offerViewing` tool and prompt rule, `getBookingCardData`, the booking card, `requestViewing` steps 1 to 8 with the lock order and `AlreadyBookedError`, the error mapping, `getViewingCards`, and the saved confirmation card appended from the returned `message`, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-12**
2. Reuse and history: the `already_booked` state, contact refresh and NOTE activities, the conversation link rules, the active viewing cap, cards that follow the lead's current viewing, the chat page's batch load of card data, the `tool-offerViewing` history branch and the second query for viewing notes, and the live "Book a viewing" chip, satisfies **AC-6**, **AC-7**, **AC-8**, **AC-10**, **AC-13**
3. Visitor management: the `rescheduleViewingIn` split with `VISITOR_RESCHEDULE_REASON` and the conflict safe insert, visitor cancel rights in `assertViewingTransition` and the ownership check in `transitionViewingIn`, `changeViewingTime` and `cancelViewing` with the 2 hour rule and change cap, satisfies **AC-9**, **AC-10**
4. Account section "Your viewings" and the WhatsApp tick on `/account`, satisfies **AC-11** (the deletion scrub additions land with feature 17, which builds the scrub)
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
- Spec 0002 changes: the `findOrCreateLeadAndViewingIn` and `rescheduleViewingIn` splits, the visitor reschedule reason, visitor cancel rights, refreshed open lead contacts, and wider deletion scrubbing.
- Feature 19 sends the booking emails (and later WhatsApp) using this data.

## Follow-up

- [ ] Update spec 0002: the three new columns (including `viewings.conversation_id` as the success metric's source), the `findOrCreateLeadAndViewingIn` and `rescheduleViewingIn` splits, the visitor reschedule reason, visitor cancel rights, open lead contact refresh (replacing "snapshot unchanged" for open leads), and the wider deletion scrub.
- [ ] Update spec 0006: replace its "add a `bookViewing` tool" follow-up checkbox with the `offerViewing` tool, `user` on `ToolScope`, its prompt rule, the history conversion for booking parts, and the live "Book a viewing" chip.
- [ ] Update spec 0008: the WhatsApp tick on `updateProfile` and `/account`'s phone field.
- [ ] Feature 17 (account deletion): include this spec's scrub additions when the scrub is built.
- [ ] Feature 9 (lead inbox): show `contact_whatsapp`, the note, NOTE activities, and the conversation; let agents confirm a time (`confirmed_for`), propose another, and mark completed or no show.
- [ ] Feature 18 (analytics): count "viewings booked through the assistant" as viewings with `conversation_id` not null.
- [ ] Feature 19 (notifications): email the visitor on request, confirmation, change, and cancel; alert the assigned agent on new requests.
- [ ] Agent availability calendar (deferred): replace fixed slots with real availability when designed.
- [ ] Bangla booking cards, if Bangla chats show they're needed.
