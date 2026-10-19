# 0009. Property details page

**Date**: 2026-10-19
**Status**: In Progress

## Summary

Every published home gets its own public page at `/properties/<slug>`: a photo mosaic with a full screen viewer, key facts, the description, amenities, a specifications table, the area with a Google Maps link, the advisor, and up to three similar homes. Visitors act on a home through the assistant: "Ask about this home" and "Book a viewing" open the chat with that home in context, so every booking runs through one path (spec 0007). The page is cached on first visit and refreshed the moment an agent changes the listing, shared links show a generated preview card, and agents can preview drafts before publishing.

## Context

Buyers, especially families abroad sharing homes on WhatsApp, need one link per home that loads fast, looks trustworthy, and leads them into the conversation where bookings happen. Until now listings exist only as cards inside the chat, which can't be shared, indexed by search engines, or opened outside a conversation.

The forces: listings already carry everything needed for a page (spec 0002: price, sizes, rooms, amenities, photos, coordinates, assigned agent), and spec 0005 already refreshes the `listing:<id>` and `listings` cache tags whenever a public listing changes, and sets the public page rule (PUBLISHED shows, SOLD shows with a badge and `noindex`, everything else is 404). Spec 0006 already accepts `/assistant?listing=<slug>` as a starting point and `?q=` as a prefilled message. The mockup (`desing-check/aurevia-estates/property.html`) shows more than the data model holds: extra specifications (facing, ownership, plan approval), an area median price comparison, an inline booking form, and agent ratings.

The page is public, so it must stay cacheable (no session reads), return real HTTP status codes for crawlers, and work on slow phone connections in Bangladesh. Without it, features 11 (search), 12 (homepage), 14 (saved homes), and 16 (SEO) have nothing to link to.

## Requirements

**User stories**:
- As a buyer, I want a page for a home I can open from anywhere and share, so my family can look at it too.
- As a buyer, I want to see every photo large, and the facts at a glance.
- As a buyer, I want to ask about this home or book a viewing in one tap.
- As a buyer abroad, I want a link preview in WhatsApp that shows the home and its price.
- As an agent, I want edits to show on the page at once, and to preview a draft before it goes live.

**Acceptance criteria**:
- **AC-1**: `/properties/<slug>` for a PUBLISHED listing shows, in order: a breadcrumb (Home linking to `/`, then the property type and area as plain text, then the title marked as the current page), the type with "For sale", the `ref_code`, the title, the address line and area, the price (spec 0003 `PriceTag`, with "Negotiable" when set), and the price per built up sqft when the home has a size (sold homes keep both); then the gallery (AC-4), the key facts (spec 0003 `SpecChips`, the same chips as the cards, a null value hiding its chip), the description (paragraphs split on blank lines, single line breaks kept, plain text only, spec 0005 AC-14), the amenities with their labels, the specifications table (AC-13), the location block (AC-14), the advisor card (AC-6), and similar homes (AC-5).
- **AC-2**: "Ask about this home" opens `/assistant?listing=<slug>`; "Book a viewing" opens `/assistant?listing=<slug>&q=<"I'd like to book a viewing of " + ref_code>`, which fills the composer without sending (spec 0006, AC-13). A signed out visitor goes through sign in and returns to that same address. On screens below `lg`, both actions sit in a bar fixed to the bottom of the screen.
- **AC-3**: Status rules (spec 0005): a PUBLISHED listing shows normally. A SOLD listing shows with a Sold badge, no chat actions, a "This home has sold" note with "Find similar homes" opening `/assistant?q=<"Homes like " + title + " in " + area>`, and `robots: noindex`. Any other status, or an unknown slug, shows the site's not found page with `noindex` (a streamed "soft 404": under Cache Components the root layout starts the stream before the page can set a 404 status, which Next.js documents; search engines drop the page). The "Homes like…" text is cut to 500 characters (spec 0006, AC-13).
- **AC-4**: Gallery: photos in order, the cover first, then the rest by `sort_order`. The cover large with up to 4 more photos beside it (stacked below on phones), and "View all N photos" (N = all photos) when there are more than 5; a single photo shows alone. A photo with empty alt text uses "<title>, photo N". Any photo opens a full screen viewer (spec 0003 `Dialog`) showing one photo at a time with its alt text, "3 of 12", previous and next buttons, left and right arrow keys, swipe on touch screens, Escape to close, and focus back on the photo that opened it. Photos load sized through `next/image` (spec 0003 hosts, using the stored `width` and `height` when present), the cover with priority, and a broken photo shows the framed house icon (spec 0003).
- **AC-5**: "You may also consider" shows up to 3 other PUBLISHED listings of the same property type priced within 25% of this one (both ways), ranked by same area first, then area centers within 3 km (`nearbyKm`, spec 0006), then the rest, and within each group by closest price, then newest published. SOLD and other statuses never appear. Each is a spec 0003 `PropertyCard` linking to its page. The block is hidden when there are none.
- **AC-6**: The advisor card shows the listing's assigned agent when their profile is public (`agent_is_public`, not deleted): name, `agent_title`, photo (`agent_photo_url`, else initials), and, when `agent_whatsapp` is set, a WhatsApp button opening `https://wa.me/<agent_whatsapp digits only>?text=<"Hello, I'm asking about <title> (<ref_code>)" URL encoded>`. Otherwise it shows "An Aurevia advisor" with no individual details. The chat actions (AC-2) sit in this card on larger screens. No ratings or sales counts.
- **AC-7**: A change to a published or sold listing (spec 0005 actions, which call `updateTag`) shows on the page on the next request, including a move out of PUBLISHED, which turns the page into a 404 at once. Similar homes refresh when any listing changes (tag `listings`). An agent saving their own profile (name or agent card fields) calls `updateTag("listings")`, so advisor cards never go stale.
- **AC-8**: Search and sharing: the page title is "<title> in <area>" (the site template adds the brand), the description is "<type> in <area> · <beds> bed · <price>. " (the bed segment left out when `bedrooms` is null; the price through `formatPrice`) followed by the start of the listing description, cut at a word boundary to 160 characters in total; the canonical URL is `NEXT_PUBLIC_SITE_URL/properties/<slug>`; `metadataBase` is `NEXT_PUBLIC_SITE_URL`. Open Graph and Twitter cards use a generated 1200×630 image (alt "<title> in <area>") showing the cover photo, title, area, price, and the Aurevia wordmark set as text in Inter. The cover is fetched with a 3 second timeout; on any failure (timeout, error, or a format the image renderer can't read, such as WebP or AVIF) the card renders the same text on the brand background.
- **AC-9**: Share (next to the title): opens the device's share sheet (`navigator.share`) with the title and canonical URL where supported; otherwise copies the URL and shows a "Link copied" toast (spec 0003 `toast`). Cancelling the share sheet does nothing (no copy, no toast).
- **AC-10**: Agent preview: the listing editor (spec 0005) shows "Preview page", opening `/dashboard/listings/<id>/preview`, which renders the same page layout for a listing in any status, behind `requireAgent()`, never cached, `noindex`, with a "Preview, not public" banner and the listing's status. Any agent may preview any listing (spec 0005: agents read all listings). It uses its own lenient mapper, not `serializeListing`; missing fields show as "Not set" (an empty price shows "Price not set" and no price per sqft) instead of failing. Chat actions and Share are shown but disabled.
- **AC-11**: Chat result cards (spec 0006) link to `/properties/<slug>` for available listings.
- **AC-12**: The page meets WCAG 2.2 AA (spec 0003): one `h1` (the title), sections with headings, every control reachable and visible by keyboard, the viewer announced as a dialog, and axe finds no serious issue.
- **AC-13**: The specifications table shows only stored values, each row hidden when empty: Property type; Completion (Ready to move, or Under construction with "Handover <month year>"); Built up area; Land (`toKatha`, "<n> katha"); Bedrooms; Bathrooms; Floor ("<n> of <total>", or "<n>" without a total; "Ground" for 0); Total floors; Parking spaces; Reference (`ref_code`).
- **AC-14**: The location block shows the area name and an "Open in Google Maps" link built from the stored coordinates (spec 0005's `googleMapsLink`). Feature 13 later adds the map and nearby places to this block.

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

## Decision

**Chosen option**: Option 1: One cached server page per listing, actions through the assistant.

Each published listing gets a public page at `/properties/<slug>`, cached on first visit under the `listing:<id>` and `listings` tags, showing only stored facts, with "Ask about this home" and "Book a viewing" leading into the assistant.

**Implementation skills**: `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`) · `prisma-client-api` (`prisma/skills`, `.claude/skills/prisma-client-api/`)

## Rationale

The success metric is viewings booked through the assistant, and spec 0007 deliberately made the chat the one place a booking happens, with rules tied to the conversation (the home must have been shown, the visitor confirms on a card). An inline form or an open enquiry form would add a second path that either duplicates those rules or bypasses them, and the open form would need bot protection that isn't configured yet. Sending both actions into the assistant with the listing preloaded keeps one path and still makes "book" a single tap plus a confirm.

Caching on first visit fits the forces exactly: spec 0005 already refreshes the right tags on every change, so freshness is solved; the page reads no session, so it stays public and cacheable; and keeping the database out of the build keeps deploys independent of data, which matters while the database itself is moving regions (spec 0001). Showing only stored facts avoids inventing data (the mockup's ownership and plan approval rows) or statistics that mislead with few listings (an area median); agents can put extra facts in the description until real fields are justified.

The generated share card is worth its small cost because WhatsApp is how families abroad pass homes around; a card with the price and area turns a bare link into something people tap. The agent preview closes the loop for spec 0005's publish checklist: agents see the real page before buyers do.

## Feature design

**Data model sketch**:
No schema change. The page reads spec 0002 tables only:
- `listings`: `slug` (unique), `ref_code`, `status`, `property_type`, `title`, `description`, `price_bdt`, `price_negotiable`, `area_id`, `address_line`, `latitude`, `longitude`, `bedrooms`, `bathrooms`, `built_up_sqft`, `land_katha`, `floor_number`, `total_floors`, `parking_spaces`, `completion_status`, `handover_date`, `assigned_agent_id`, `published_at`.
- `listing_photos` (by `sort_order`, cover first), `listing_amenities` → `amenities` (`label`, by `sort_order`), `areas` (`name_en`, `center_lat`, `center_lng`).
- `profiles` for the advisor: `full_name`, `agent_title`, `agent_photo_url`, `agent_whatsapp`, `agent_is_public`, `deleted_at`.

**State transitions**:
None new. The page follows `listings.status` (spec 0002): PUBLISHED renders; SOLD renders with the sold treatment; DRAFT, UNPUBLISHED, PENDING_REVIEW, CHANGES_REQUESTED, REJECTED are 404.

**API surface**:
| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/properties/[slug]` | page (GET) | `slug` | the page of AC-1 | public, no session read | 404 when unknown or not PUBLISHED/SOLD |
| `/properties/[slug]/opengraph-image` | image route (GET) | `slug` | 1200×630 PNG (AC-8) | public | 404 like the page; text only card when the cover fails |
| `/dashboard/listings/[id]/preview` | page (GET) | `id` | the page layout in preview mode (AC-10) | `requireAgent()` | 404 for unknown id |
| `getPublicListing(slug)` | server read, `lib/server/public-listings.ts`, `'use cache'` | `slug` | `{ status: "PUBLISHED" \| "SOLD", listing: PublicListing }` or `null` | public | none (null means 404) |
| `getSimilarListings(listing)` | server read, `'use cache'`, tag `listings` | the listing's id, type, price, area | up to 3 `ListingCardDTO` with `slug` | public | none |

`getPublicListing` uses `cacheTag("listings")` and `cacheTag("listing:<id>")` (the id from the row it read) and `cacheLife("days")`. It joins the assigned agent (`full_name`, `agent_title`, `agent_photo_url`, `agent_whatsapp`, `agent_is_public`, `deleted_at`) and orders photos cover first, then by `sort_order`. A slug that isn't PUBLISHED or SOLD is not cached for days: the read returns null under `cacheLife("seconds")`, so random slugs from bots can't fill the cache and a newly published slug appears at once. `generateMetadata` and the page call the same function with the same argument, so it reads once per request.

**Not found**: `generateMetadata` and the page both call `notFound()` when `getPublicListing(slug)` is null. Measured during the build (2026-10-19): the root layout's Suspense boundary (the header's account slot) starts the stream first, so the status stays 200 and Next.js adds `noindex`. The engineer accepted this soft 404 over a database check in `proxy.ts` on every property request.

`getSimilarListings` is keyed on plain values `(id, propertyType, areaId, priceBdt)`: it computes the ±25% band in whole taka (converted with `BigInt`), fetches at most 50 PUBLISHED candidates of that type in the band (newest first, with `listingCardInclude` for the cover), ranks them in code with `distanceKm` from `match-score.ts`, and returns 3.

The share card route reads `getPublicListing` too, so it is cached and refreshed under the same tags. `PublicListing` extends spec 0002's `serializeListing` output with `advisor` (`{ name, title, photoUrl, whatsapp } | null`) and `pricePerSqft` (`number | null`). The preview path reads with a lenient mapper that tolerates the empty fields a draft may have (spec 0005) and is never cached.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Page | which listing | `listings.slug` = the route `slug` |
| Page | sold treatment, 404 | `listings.status` |
| Page | breadcrumb type and area | `property_type` via `propertyTypeLabels` (spec 0003); `areas.name_en` |
| Page | price, negotiable | `price_bdt` through `toTaka` and `formatPrice`; `price_negotiable` |
| Page | price per sqft | `round(price_bdt / built_up_sqft)`, whole taka; hidden when `built_up_sqft` is null |
| Page | photos, order, cover, alt | `listing_photos`: the `is_cover` photo first, then by `sort_order`; `alt`, else "<title>, photo N"; `width`, `height` |
| Page | amenity labels | `amenities.label` through `listing_amenities`, by `amenities.sort_order` |
| Page | handover month | `handover_date` formatted "MMM yyyy" in Asia/Dhaka, shown only when `completion_status` is UNDER_CONSTRUCTION |
| Page | Maps link | `googleMapsLink(latitude, longitude)` (spec 0005) |
| Advisor card | name, title, photo, WhatsApp | assigned agent's `full_name`, `agent_title`, `agent_photo_url` (else initials, spec 0003 `Avatar`), `agent_whatsapp` reduced to digits, shown only when `agent_is_public` and `deleted_at` is null |
| Chat actions | target addresses | `slug`, `ref_code`, `title`, `areas.name_en` (AC-2, AC-3) |
| Similar homes | candidates | PUBLISHED, same `property_type`, `price_bdt` within ±25% (whole taka), not this id, at most 50 newest |
| Similar homes | ranking | same `area_id`; else `distanceKm` between area centers ≤ 3 (spec 0006 `match-score.ts`); then `abs(price difference)`; then `published_at` desc |
| Metadata | title, description, canonical | `title`, area, type, `bedrooms`, price, `description`; `NEXT_PUBLIC_SITE_URL` (spec 0004) |
| Share card | photo, text | the cover photo URL (3 s timeout); `title`, area name, `formatPrice`; Inter from Google Fonts |
| Share | URL | the canonical URL |
| Preview | listing | `listings.id` from the route, any status |

**Key invariants**:
- Only PUBLISHED and SOLD listings are ever visible on the public route; every other status and every unknown slug shows the not found page with `noindex`.
- The public page never reads cookies or the session, so it stays cacheable.
- A listing change that spec 0005 makes reaches the page on the next request.
- The page shows no value the database doesn't hold (no invented specs, no computed comparisons).
- An agent's contact appears only when that agent made their profile public.
- The preview route is never cached and never indexed.

**Security model**:
- **Public**: reads PUBLISHED and SOLD listing facts, photos, amenities, area, and a public agent card. No personal data of buyers; no agent contact unless the agent opted in.
- **Agents**: the preview of any listing, through `requireAgent()` (spec 0004).
- No writes on this page. The share card route reads the same public data only. The cover photo it fetches is already restricted to spec 0005's allowed hosts.

**Configuration required**:
No new env vars. Uses `NEXT_PUBLIC_SITE_URL` (spec 0004).

**Critical test scenarios**:
- Happy path: a published apartment's page shows title, price, price per sqft, gallery, facts, description paragraphs, amenities, specifications, location link, advisor, and similar homes, verifies **AC-1**, **AC-5**, **AC-13**, **AC-14**.
- Chat entry: "Book a viewing" signed out goes through sign in and lands in the assistant with the home greeted and the composer filled, verifies **AC-2**.
- Status: unpublish the listing; the page shows the not found page with `noindex` on the next request; publish again, it's back; mark sold, it shows the Sold treatment with `noindex` and no chat actions, verifies **AC-3**, **AC-7**.
- Freshness: change the price in the editor; the page and the share card show it on the next request, verifies **AC-7**, **AC-8**.
- Similar homes: with homes of the same type in the same area, a nearby area, and far away, the same area ones come first; a home 30% more expensive never appears; with none, the block is hidden, verifies **AC-5**.
- Advisor: a public agent with WhatsApp shows the button with the prefilled text; a non public agent shows "An Aurevia advisor", verifies **AC-6**.
- Gallery: keyboard only, open the viewer, move with arrows, close with Escape, focus returns, verifies **AC-4**, **AC-12**.
- Share: with no share sheet, the link is copied and the toast shows, verifies **AC-9**.
- Preview: an agent previews a draft with no price ("Not set"); a visitor gets 404 on the preview route, verifies **AC-10**.
- Chat cards link to the page, verifies **AC-11**.
- Metadata: the page's canonical, title, description, and Open Graph image match the rules; a sold page carries `noindex`, verifies **AC-8**, **AC-3**.
- Axe: no serious issues on a published and a sold page, verifies **AC-12**.

## Build plan

Tracer Bullet: first one real page end to end (cached read, page, correct 404, entry into the chat), then thicken the page, then the share card, then the agent preview.

1. [x] Thin thread: `getPublicListing(slug)` with its cache tags, the agent join, and the uncached null, `/properties/[slug]` with breadcrumb, title block, price and price per sqft, cover photo, key facts, description, and the chat actions (including the mobile bar); the status rules with a real HTTP 404 and the sold treatment; chat result cards linking to the page; the agent profile save calling `updateTag("listings")`, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-7**, **AC-11**
2. [x] The full page: gallery mosaic and full screen viewer, amenities, specifications table, location block, advisor card, Share, satisfies **AC-1**, **AC-4**, **AC-6**, **AC-9**, **AC-12**, **AC-13**, **AC-14**
3. [x] Similar homes: `getSimilarListings` with the ranking rule and its tag, satisfies **AC-5**, **AC-7**
4. [x] Search and sharing: metadata (title, description, canonical, `noindex` for sold) and the generated Open Graph image with its fallback, satisfies **AC-3**, **AC-8**
5. [x] Agent preview: the lenient mapper, `/dashboard/listings/[id]/preview`, and the editor's "Preview page" link, satisfies **AC-10**

## Consequences

**Positive**:
- Every published home has a fast, shareable page, the base features 11, 12, 13, 14, and 16 build on.
- One booking path: every booking still comes from the assistant, so the success metric and spec 0007's protections stay whole.
- Agent edits show at once with no extra cache work; spec 0005's tags already cover it.
- No database at build time and no new services or keys.

**Negative / tradeoffs**:
- Booking from a page takes a hop into the chat, and needs sign in, so some buyers who would fill a quick form will leave instead.
- The first visit after any listing change renders from the database; a burst of edits means more uncached renders.
- The page shows less than the mockup (no ownership, plan approval, year, area median, ratings) until those fields are justified and specced.
- The generated share card fetches the cover photo at render time; a slow or broken host degrades it to the text card, and WebP or AVIF covers always get the text card.
- Similar homes recompute on any listing change (tag `listings`), which is fine at agency scale but grows with listings.

**Neutral**:
- Feature 13 adds the map and nearby places to the location block; feature 14 adds the heart beside Share; feature 16 adds structured data (JSON-LD) and the sitemap entries for these pages.
- Spec 0006's follow-up "set `/properties/<slug>` live so cards link to it" is done by this feature.

## Follow-up

- [x] 404 pattern checked while building: soft 404 with `noindex` accepted (see *Not found*). Revisit with a slug check in `proxy.ts` if search console reports problems.
- [ ] Spec 0006: mark its follow-up "set `/properties/<slug>` live" done when step 1 ships.
- [ ] Feature 16 (SEO baseline): JSON-LD for these pages and sitemap entries (PUBLISHED only, not SOLD).
- [ ] Feature 13 (map view): the map and nearby places in the location block (AC-14).
- [ ] Feature 14 (saved homes): the heart beside Share.
- [ ] Revisit extra specification fields (year completed, facing, ownership) if agents keep writing them into descriptions.
