# Rationale: 0007. Viewing booking from chat

Decision record for [spec 0007](index.md).

## Context

The success metric is viewings booked through the assistant. Spec 0002 already provides the lead and viewing tables, the idempotent `findOrCreateLeadAndViewing`, and the viewing state machine; spec 0006 provides the chat turn, the shown listing set, and the turn lock. Agent calendars are deferred, so a booking is a request the agent confirms. Buyers include families abroad in other time zones, and agents in Sylhet coordinate mostly by phone and WhatsApp. A booking must never happen because the model misread a message or followed injected text.

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

## Rationale

The model proposing and the visitor confirming keeps the success metric honest: every booked viewing is one a person asked for, with a validated phone and a real slot. Fixed slots stand in for agent calendars (deferred) while keeping requests inside working hours; treating them as requests (no capacity rules) avoids slots blocked by unconfirmed bookings. A fixed confirmation card costs nothing and can't misstate the time. The engineer chose to refer to bookings by the listing code rather than a new viewing reference; a lead has at most one active viewing, and the card follows the lead, so "your viewing of AUR-1042" is unambiguous. Refreshing an open lead's contact copy (a change to spec 0002's snapshot rule) was chosen because a stale number defeats the lead; closed leads keep their history. Caps of 5 active viewings and 3 changes per lead protect agents and the future notification emails without bothering real buyers. Booking cards stay in English by the engineer's choice.

