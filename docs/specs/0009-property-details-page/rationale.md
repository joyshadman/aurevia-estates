# Rationale: 0009. Property details page

Decision record for [spec 0009](index.md).

## Context

Buyers, especially families abroad sharing homes on WhatsApp, need one link per home that loads fast, looks trustworthy, and leads them into the conversation where bookings happen. Until now listings exist only as cards inside the chat, which can't be shared, indexed by search engines, or opened outside a conversation.

The forces: listings already carry everything needed for a page (spec 0002: price, sizes, rooms, amenities, photos, coordinates, assigned agent), and spec 0005 already refreshes the `listing:<id>` and `listings` cache tags whenever a public listing changes, and sets the public page rule (PUBLISHED shows, SOLD shows with a badge and `noindex`, everything else is 404). Spec 0006 already accepts `/assistant?listing=<slug>` as a starting point and `?q=` as a prefilled message. The mockup (`desing-check/aurevia-estates/property.html`) shows more than the data model holds: extra specifications (facing, ownership, plan approval), an area median price comparison, an inline booking form, and agent ratings.

The page is public, so it must stay cacheable (no session reads), return real HTTP status codes for crawlers, and work on slow phone connections in Bangladesh. Without it, features 11 (search), 12 (homepage), 14 (saved homes), and 16 (SEO) have nothing to link to.

## Options considered

### Option 1: One cached server page per listing, actions through the assistant (chosen)

A server rendered page per slug, its data read through a cached function tagged with spec 0005's tags, rendered on first visit and kept until an agent's change refreshes it. The only actions are links into the assistant.

**Pros**:
- One booking path, so spec 0007's rules (shown homes, slots, caps) and the success metric stay whole.
- Fast repeat visits without touching the database, and changes appear at once through the existing tags.
- No database access needed at build time.

**Cons**:
- The first visitor after a change pays for the render.
- Booking takes one more step (into the chat) than an inline form.

### Option 2: Prerender every listing at build, inline booking on the page

All published listings rendered during the build, plus spec 0007's booking card embedded on the page.

**Pros**:
- Instant first visits; booking without leaving the page.

**Cons**:
- The build needs the database and grows with every listing.
- A second booking entry point, outside a conversation, needs its own rules for "shown homes", the conversation link, and confirmation, all of which spec 0007 tied to the chat.

### Option 3: Render on every request with an open enquiry form

Always fresh from the database, and a signed out enquiry form creating LISTING_INQUIRY leads.

**Pros**:
- Simplest freshness story; captures buyers who won't sign in.

**Cons**:
- Every visit hits the database; slower on bad connections.
- A public form needs bot protection (hCaptcha, not yet configured, spec 0004) and splits leads across two sources before the inbox can tell them apart well.

## Rationale

The success metric is viewings booked through the assistant, and spec 0007 deliberately made the chat the one place a booking happens, with rules tied to the conversation (the home must have been shown, the visitor confirms on a card). An inline form or an open enquiry form would add a second path that either duplicates those rules or bypasses them, and the open form would need bot protection that isn't configured yet. Sending both actions into the assistant with the listing preloaded keeps one path and still makes "book" a single tap plus a confirm.

Caching on first visit fits the forces exactly: spec 0005 already refreshes the right tags on every change, so freshness is solved; the page reads no session, so it stays public and cacheable; and keeping the database out of the build keeps deploys independent of data, which matters while the database itself is moving regions (spec 0001). Showing only stored facts avoids inventing data (the mockup's ownership and plan approval rows) or statistics that mislead with few listings (an area median); agents can put extra facts in the description until real fields are justified.

The generated share card is worth its small cost because WhatsApp is how families abroad pass homes around; a card with the price and area turns a bare link into something people tap. The agent preview closes the loop for spec 0005's publish checklist: agents see the real page before buyers do.

