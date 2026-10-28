# Scope: Aurevia Estates

AI real estate site for a curated Sylhet agency. Signed in visitors (local buyers, families abroad) chat in English or Bangla with an assistant that matches them to hand checked listings and books a viewing into an agent's lead inbox. Later, outside sellers submit listings and pay to feature them.

**Build approach:** Tracer Bullet (one thin thread through every layer, then thicken a segment at a time).
**Workflow:** Beta (after `/develop`: `/check verify`, then `/test`). A feature tag (e.g. `· GA`) overrides it.
**Success metric:** viewings booked through the assistant.
**Design reference:** mockups in `desing-check/aurevia-estates/`.

_Recommendations, not rules: skip `/architect` when you already know the build. You decide when a feature is `done`._

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Stack & architecture | Foundation | in-progress |
| 2 | Coding standards & tooling | Foundation | planned |
| 3 | Data model | Foundation | in-progress |
| 4 | Design system & UI foundation | Foundation | in-progress |
| 5 | Visitor & agent sign in | Slice 1 | in-progress |
| 6 | Agent listing management | Slice 1 | in-progress |
| 7 | AI home finder chat | Slice 1 | in-progress |
| 8 | Viewing booking from chat | Slice 1 | in-progress |
| 9 | Agent lead inbox | Slice 1 | in-progress |
| 10 | Property details page | Slice 2 | in-progress |
| 11 | Property search & filters | Slice 2 | in-progress |
| 12 | Homepage | Slice 2 | in-progress |
| 13 | Map view | Slice 2 | in-progress |
| 14 | Saved homes | Slice 2 | in-progress |
| 15 | About & contact | Slice 2 | in-progress |
| 16 | SEO baseline | Slice 2 | in-progress |
| 17 | Privacy, terms & cookie consent | Slice 3 | in-progress |
| 18 | Analytics & error tracking | Slice 3 | in-progress |
| 19 | Booking & lead notifications | Slice 3 | in-progress |
| 20 | Listing photo upload | Slice 4 | in-progress |
| 21 | AI listing descriptions | Slice 4 | in-progress |
| 22 | Agent dashboard overview | Slice 4 | in-progress |
| 23 | Seller listing submission | Slice 5 | planned |
| 24 | Listing review & approval | Slice 5 | planned |
| 25 | Paid featured listings | Slice 6 | in-progress |

## Foundations

### 1. Stack & architecture · in-progress
Decide the stack (data, auth, AI, hosting) on the Next.js + Tailwind scaffold; add only what slice 1 needs.
**Done when:** the stack is in a spec, and the app boots and builds with it.
- [x] Decide the stack (spec): `/architect stack & architecture`
- [x] Scaffold from the decision: `/develop stack & architecture`
Spec [0001](../specs/0001-stack-architecture/index.md) · code in `app/`, `lib/`, `prisma/`, `proxy.ts` (boot against the new Neon database still to verify)

### 2. Coding standards & tooling
Conventions from the real project, plus lint, format, type strictness, pre commit.
**Done when:** root `AGENTS.md` matches the stack, and lint, format, and pre commit run clean.
- [x] Capture conventions + tooling choices: `/audit`

### 3. Data model · in-progress
Users with roles, listings (status, featured), conversations and messages, viewings, leads.
**Done when:** chat matching, booking, seller submission, and featuring need no breaking migration.
- [x] Design it (spec): `/architect data model`
- [ ] Build it: `/develop data model`
  - [x] Slice 1 schema, raw SQL constraints, RLS, clean drift check (AC-1, AC-3, AC-4, AC-14)
  - [x] Seed: areas, amenities, sample listings (AC-2)
  - [x] Listing domain: type rules, publish, search, photos, serialization (AC-3 to AC-6)
  - [ ] Chat store, booking, AI usage, status transitions, profile tombstone (AC-7 to AC-11)
  - [ ] Database tests for slice 1 (AC-1 to AC-11, AC-14)
- [ ] Verify it: `/check verify data model`
- [ ] Test it: `/test data model`
Spec [0002](../specs/0002-data-model/index.md) · code in `prisma/`, `lib/domain/`, `lib/server/`

### 4. Design system & UI foundation · in-progress
Mockup theme as tokens and base components.
**Done when:** `design.md` covers type, color, spacing, components, and base components meet WCAG AA.
- [x] Design it (spec): `/architect design system & UI foundation`
- [ ] Build it: `/develop design system & UI foundation`
  - [x] Tokens both themes, fonts, theme script, Button, header, `/styleguide`, lint and axe (AC-1, AC-3, AC-4, AC-7, AC-8, AC-10, AC-11, AC-13)
  - [x] Base kit: controls, overlays, toasts, states (AC-2, AC-8, AC-9, AC-11, AC-16)
  - [x] Site chrome and listing pieces (AC-6, AC-12, AC-13, AC-14)
  - [ ] Account theme sync after sign in, per spec 0024's sync table (AC-5, AC-6; 0024 AC-4 to AC-6)
  - [x] Root `design.md` (AC-15)
  - [ ] Light default cleanup: constant typing, `getStoredChoice()`, cross tab clear, fix and add theme e2e tests (spec 0024, AC-1, AC-2, AC-7)
- [ ] Verify it: `/check verify design system & UI foundation`
- [ ] Test it: `/test design system & UI foundation`
Spec [0003](../specs/0003-design-system-ui-foundation/index.md), amended by [0024](../specs/0024-light-theme-default.md) · code in `app/globals.css`, `components/`, `lib/`, `design.md`

## Slice 1: Core loop (chat to booked viewing)

### 5. Visitor & agent sign in · in-progress · GA
Accounts to chat; agents sign in with their own role. Personal data, so extra rigor.
**Done when:** visitors sign up, in, and out; agents reach agent pages; visitors can't.
- [x] Design it (spec): `/architect visitor & agent sign in`
- [x] Build it: `/develop visitor & agent sign in`
  - [x] Neon + Better Auth thread: auth migration, email codes, `/auth/confirm`, sign out (AC-1, AC-2, AC-6, AC-11, AC-12, AC-13, AC-15)
  - [x] Abuse controls and password flows (AC-2, AC-3, AC-4, AC-7, AC-13)
  - [x] Google sign in and linking guard (AC-5, AC-6)
  - [x] Agents: password + TOTP, 12 hour sessions, security page, backup codes, scripts (AC-7, AC-8, AC-9, AC-14, AC-15)
  - [x] Account page; Supabase removed (AC-10, AC-13, AC-15, AC-16)
- [ ] Verify it: `/check verify visitor & agent sign in`
- [ ] Test it: `/test visitor & agent sign in`
- [ ] Review it (fresh model): `/check review visitor & agent sign in`
- [ ] Document it: `/document visitor & agent sign in`
Spec [0008](../specs/0008-better-auth-sign-in/index.md) (supersedes [0004](../specs/0004-visitor-agent-sign-in/index.md)) · code in `app/(auth)/`, `app/account/`, `app/dashboard/`, `lib/server/auth.ts`, `lib/server/auth-config.ts`, `scripts/`, `proxy.ts`, `vercel.json`

### 6. Agent listing management · in-progress
Agent form to create, edit, and unpublish listings so the assistant has real homes.
**Done when:** agents create and edit listings, and only published ones reach the assistant.
- [x] Design it (spec): `/architect agent listing management`
- [x] Build it: `/develop agent listing management`
  - [x] Draft migration, create, edit, publish (AC-2, AC-5, AC-15)
  - [x] Full form, conflict checks, read only mode (AC-3, AC-4, AC-6, AC-9, AC-12, AC-13, AC-14)
  - [x] Photo links and Maps location (AC-7, AC-8, AC-13)
  - [x] Lifecycle and reassign with lead moves and cache refresh (AC-10, AC-11, AC-12, AC-13)
  - [x] Listing table: tabs, search, mine, paging (AC-1)
- [ ] Verify it: `/check verify agent listing management`
- [ ] Test it: `/test agent listing management`
Spec [0005](../specs/0005-agent-listing-management/index.md) · code in `app/dashboard/listings/`, `lib/server/agent-listings.ts`, `lib/server/photo-links.ts`, `lib/server/location.ts`, `lib/domain/publish-checklist.ts` · migration `20261021120000_listing_drafts` applied

### 7. AI home finder chat · in-progress · GA
The assistant learns budget, area, family, and lifestyle in English or Bangla, then recommends published listings as cards.
**Done when:** chat works in both languages, shows only real matching listings, and is saved to the account.
- [x] Design it (spec): `/architect AI home finder chat`
- [x] Build it: `/develop AI home finder chat`
  - [x] Tools, scoring, model eval gate, no UI (AC-1, AC-3, AC-5, AC-6, AC-7, AC-8)
  - [x] Streaming turn, saves, live cards (AC-2, AC-4, AC-15, AC-18)
  - [x] Daily limit, interrupted replies, Retry, Stop (AC-9, AC-10, AC-15)
  - [x] Full chat page: panes, conversations, brief, Show more, chips (AC-4, AC-11, AC-12, AC-13, AC-16, AC-17)
  - [x] Agency fact sheet editor with versions (AC-14)
- [ ] Verify it: `/check verify AI home finder chat`
- [ ] Test it: `/test AI home finder chat`
- [ ] Review it (fresh model): `/check review AI home finder chat`
- [ ] Document it: `/document AI home finder chat`
Spec [0006](../specs/0006-ai-home-finder-chat/index.md) · code in `app/assistant/`, `app/api/chat/`, `app/dashboard/assistant-facts/`, `lib/server/assistant/`, `lib/server/conversations.ts`, `lib/assistant/`

### 8. Viewing booking from chat · in-progress
Visitor picks a time on a recommended listing; the chat confirms the viewing.
**Done when:** a visitor books in chat, sees a confirmation, and the booking is stored as a lead.
- [x] Design it (spec): `/architect viewing booking from chat`
- [x] Build it: `/develop viewing booking from chat`
  - [x] Migration, slots, booking card, `requestViewing`, confirmation card (AC-1, AC-2, AC-3, AC-4, AC-5, AC-12)
  - [x] Reuse, caps, live cards, model notes (AC-6, AC-7, AC-8, AC-10, AC-13)
  - [x] Visitor change and cancel, 2 hour rule (AC-9, AC-10)
  - [x] "Your viewings" on `/account`, WhatsApp tick (AC-11)
  - [x] Three assistant eval cases (AC-14)
- [ ] Verify it: `/check verify viewing booking from chat`
- [ ] Test it: `/test viewing booking from chat`
Spec [0007](../specs/0007-viewing-booking-from-chat/index.md) · code in `app/assistant/booking-*.ts(x)`, `app/assistant/viewing-parts.tsx`, `app/account/your-viewings.tsx`, `lib/server/bookings.ts`, `lib/server/viewing-cards.ts`, `lib/domain/viewing-slots.ts` · migration `20261023120000_booking_whatsapp` applied

### 9. Agent lead inbox · in-progress
Booked viewings with chat context so an agent can follow up.
**Done when:** agents see new viewings with contact, listing, time, and the conversation, and can mark a lead contacted.
- [x] Design it (spec): `/architect agent lead inbox`
- [x] Build it: `/develop agent lead inbox`
  - [x] Inbox tabs, counts, Mine only, paging; lead page; confirm (AC-1, AC-2, AC-3, AC-5, AC-6, AC-15, AC-16, AC-17)
  - [x] Change time, cancel, close, closed lead rule, earlier viewings (AC-7, AC-8, AC-9, AC-10)
  - [x] Lead moves, notes, assignment (AC-11, AC-12, AC-13)
  - [x] Search and read only transcript (AC-4, AC-14)
- [ ] Verify it: `/check verify agent lead inbox`
- [ ] Test it: `/test agent lead inbox`
Spec [0009](../specs/0009-agent-lead-inbox/index.md) · code in `app/dashboard/leads/`, `lib/server/lead-inbox.ts`, `lib/server/viewing-status.ts`, `lib/server/lead-status.ts`, `lib/domain/viewing-slots.ts` · no migration

## Slice 2: Public discovery

### 10. Property details page · in-progress · assumed decision (spec 0012)
Full listing page: gallery, specs, amenities, surroundings, similar homes, "chat about this home".
**Done when:** each published listing has a fast, shareable page with SEO and social cards, and its chat starts with that listing in context.
- [ ] Design it (spec): `/architect property details page` (ratify the assumed spec 0012, including the 200 vs 404 status for missing homes)
- [x] Build it: `/develop property details page`
  - [x] Cached listing read, published slugs prerendered, not found page (AC-1, AC-5)
  - [x] Page: gallery, facts, about, amenities, specifications, location link, advisor card, similar homes, share (AC-2, AC-3)
  - [x] Metadata and social cards; cards on `/properties` and the homepage link here (AC-4, AC-6, AC-7)
- [ ] Verify it: `/check verify property details page`
- [ ] Test it: `/test property details page`
Spec [0012](../specs/0012-property-details-page/index.md) (Assumed) · code in `app/properties/[slug]/`, `app/properties/listing-href.tsx`, `lib/server/listing-page.ts` · no migration

### 11. Property search & filters · in-progress · assumed decision (spec 0010)
Filter by area, price, type, beds; grid and list views.
**Done when:** filters work, the URL reflects them, and empty and error states render.
- [ ] Design it (spec): `/architect property search & filters` (ratify the assumed spec 0010)
- [x] Build it: `/develop property search & filters`
  - [x] Cached discovery reads and URL parsing (AC-1, AC-3, AC-7)
  - [x] `/properties`: keyword, filter panel, chips, sort, grid and list, paging (AC-2, AC-4, AC-5)
  - [x] Empty, loading, and error states; "Buy" nav live (AC-6)
- [ ] Verify it: `/check verify property search & filters`
- [ ] Test it: `/test property search & filters`
Spec [0010](../specs/0010-property-search-filters/index.md) (Assumed) · code in `app/properties/`, `lib/server/discovery.ts`, `lib/domain/discovery.ts`, `lib/nav.ts` · no migration

### 12. Homepage · in-progress · assumed decision (spec 0011)
Mockup homepage: featured homes, "describe the home" entry to chat, trust sections.
**Done when:** it shows live listings, and the describe box hands its text to the assistant after sign in.
- [ ] Design it (spec): `/architect homepage` (ratify the assumed spec 0011)
- [x] Build it: `/develop homepage`
  - [x] Cached homepage read and media color tokens (AC-4, AC-5)
  - [x] Hero, search panel, newest homes, categories (AC-1, AC-3)
  - [x] Assistant promo with describe box, Why Aurevia with live stats, advisor call to action (AC-2, AC-4, AC-6)
- [ ] Verify it: `/check verify homepage`
- [ ] Test it: `/test homepage`
Spec [0011](../specs/0011-homepage/index.md) (Assumed) · code in `app/page.tsx`, `lib/server/homepage.ts`, `app/globals.css` · no migration

### 13. Map view · in-progress · assumed decision (spec 0013)
Listings on a map in discovery; location and nearby places on property pages.
**Done when:** pins link to listing pages, and each property page shows its location and nearby places.
- [ ] Design it (spec): `/architect map view` (ratify spec 0013, and pick a source for nearby places, still open)
- [x] Build it: `/develop map view`
  - [x] Leaflet and OpenStreetMap map component, themed popups (AC-4, AC-5)
  - [x] `/properties?view=map` with price pins and popups, "Explore map" nav live (AC-1, AC-2)
  - [x] Location map on each property page (AC-3)
- [ ] Verify it: `/check verify map view`
- [ ] Test it: `/test map view`
Spec [0013](../specs/0013-map-view/index.md) (Assumed) · code in `components/map/`, `app/properties/`, `lib/server/discovery.ts` · no migration

### 14. Saved homes · in-progress · assumed decision (spec 0014)
Heart listings from cards, pages, or chat.
**Done when:** a visitor can save, unsave, and see a saved homes list.
- [ ] Design it (spec): `/architect saved homes` (ratify spec 0014)
- [x] Build it: `/develop saved homes`
  - [x] `saved_homes` table and service (AC-5)
  - [x] Hearts on cards, the property page, and chat cards, with sign in when signed out (AC-1, AC-2, AC-4)
  - [x] `/saved` list and the account menu entry (AC-3)
- [ ] Verify it: `/check verify saved homes`
- [ ] Test it: `/test saved homes`
Spec [0014](../specs/0014-saved-homes/index.md) (Assumed) · code in `app/saved/`, `lib/server/saved-homes.ts` · migration `20261026120000_saved_homes` applied

### 15. About & contact · in-progress · assumed decision (spec 0015)
Agency story, team, office, and a contact form that becomes a lead.
**Done when:** the page matches the mockup, and a submitted form appears in the lead inbox.
- [ ] Design it (spec): `/architect about & contact` (ratify spec 0015; agency fills `lib/agency.ts`)
- [x] Build it: `/develop about & contact`
  - [x] `/about`: story, values, public team, contact lines from `lib/agency.ts` (AC-1, AC-5)
  - [x] Contact form with hCaptcha and a rate limit, creating a `CONTACT_FORM` lead (AC-2, AC-3, AC-4)
- [ ] Verify it: `/check verify about & contact`
- [ ] Test it: `/test about & contact`
Spec [0015](../specs/0015-about-contact/index.md) (Assumed) · code in `app/about/`, `lib/agency.ts`, `lib/server/contact.ts` · no migration

### 16. SEO baseline · in-progress · assumed decision (spec 0016)
**Done when:** a sitemap lists every published listing and public page, robots rules are set, and listings carry structured data.
- [ ] Design it (spec): `/architect SEO baseline` (ratify spec 0016)
- [x] Build it: `/develop SEO baseline`
  - [x] `sitemap.ts` and `robots.ts` (AC-1, AC-2, AC-4)
  - [x] `RealEstateListing` and agency structured data (AC-3)
- [ ] Verify it: `/check verify SEO baseline`
- [ ] Test it: `/test SEO baseline`
Spec [0016](../specs/0016-seo-baseline/index.md) (Assumed) · code in `app/sitemap.ts`, `app/robots.ts`, `lib/seo.ts` · no migration

## Slice 3: Launch readiness

### 17. Privacy, terms & cookie consent · in-progress · GA · assumed decision (spec 0017)
**Done when:** privacy and terms pages exist, non essential tracking waits for consent, and users can request deletion of their account and chats.
- [ ] Design it (spec): `/architect privacy, terms & cookie consent` (ratify the assumed spec 0017; have a lawyer review the page text; reconcile spec 0002's lead scrub with `leads_contact_ck`)
- [x] Build it: `/develop privacy, terms & cookie consent`
  - [x] `/privacy` and `/terms`, prerendered, footer links and sitemap (AC-1)
  - [x] Consent card, browser only cookie, "Cookie settings" in the footer (AC-2, AC-3)
  - [x] Self serve account deletion on `/account` with the spec 0002 and 0007 scrub (AC-4, AC-5, AC-6)
- [ ] Verify it: `/check verify privacy, terms & cookie consent`
- [ ] Test it: `/test privacy, terms & cookie consent`
- [ ] Review it: `/check review privacy, terms & cookie consent`
- [ ] Document it: `/document`
Spec [0017](../specs/0017-privacy-terms-consent/index.md) (Assumed) · code in `app/privacy/`, `app/terms/`, `lib/legal.ts`, `lib/consent.ts`, `components/chrome/consent-banner.tsx`, `lib/server/account-deletion.ts`, `app/account/` · no migration

### 18. Analytics & error tracking · in-progress · assumed decision (spec 0018)
**Done when:** funnel events (chat started, listing recommended, viewing booked) are recorded with consent, chat bookings can be counted, and production errors are reported.
- [ ] Design it (spec): `/architect analytics & error tracking` (ratify the assumed spec 0018)
- [x] Build it: `/develop analytics & error tracking`
  - [x] PostHog after consent, `track()` and the three funnel events (AC-1, AC-2)
  - [x] Assistant bookings count on `/dashboard/leads` (AC-3)
  - [x] Sentry environment, `global-error.tsx`, source map upload (AC-4)
- [ ] Verify it: `/check verify analytics & error tracking`
- [ ] Test it: `/test analytics & error tracking`
Spec [0018](../specs/0018-analytics-error-tracking/index.md) (Assumed) · code in `lib/analytics.ts`, `components/chrome/analytics.tsx`, `lib/server/metrics.ts`, `app/global-error.tsx`, `next.config.ts` · no migration

### 19. Booking & lead notifications · in-progress · assumed decision (spec 0019)
**Done when:** visitors get a booking confirmation, the assigned agent gets a new lead alert, and failed sends are retried or logged.
- [ ] Design it (spec): `/architect booking & lead notifications` (ratify the assumed spec 0019)
- [x] Build it: `/develop booking & lead notifications`
  - [x] `email_outbox` migration, applied and checked live (AC-1, AC-6)
  - [x] Queue in the booking and confirm writers, send after the response, backoff and final failure report (AC-1 to AC-4)
  - [x] Cron route with `CRON_SECRET`, daily schedule, 30 day purge (AC-4, AC-5, AC-6)
- [ ] Verify it: `/check verify booking & lead notifications`
- [ ] Test it: `/test booking & lead notifications`
Spec [0019](../specs/0019-booking-lead-notifications/index.md) (Assumed) · code in `lib/server/notify.ts`, `emails/notify/`, `app/api/cron/outbox/`, `vercel.json` · migration `20261026130000_email_outbox`

## Slice 4: Agent tools

### 20. Listing photo upload · in-progress · assumed decision (spec 0020)
**Done when:** agents upload, reorder, and remove photos with a cover, and pages load sized images.
- [ ] Design it (spec): `/architect listing photo upload` (ratify the assumed spec 0020)
- [x] Build it: `/develop listing photo upload`
  - [x] `photo_files` migration, applied and checked live (AC-2)
  - [x] Upload action with browser shrink, `sharp` re-encode, limits, and orphan cleanup (AC-1, AC-3, AC-4)
  - [x] `/photos/<sha256>.webp` route, `next/image` local pattern, absolute URLs in social cards and JSON-LD (AC-5)
- [ ] Verify it: `/check verify listing photo upload`
- [ ] Test it: `/test listing photo upload`
Spec [0020](../specs/0020-listing-photo-upload/index.md) (Assumed) · code in `lib/server/photo-files.ts`, `lib/shrink-photo.ts`, `app/photos/[file]/route.ts`, `app/dashboard/listings/[id]/photo-manager.tsx` · migration `20261026140000_photo_files`

### 21. AI listing descriptions · in-progress · assumed decision (spec 0021)
**Done when:** an agent drafts a description from a listing's fields, edits, and saves it; nothing publishes without approval.
- [ ] Design it (spec): `/architect AI listing descriptions` (ratify the assumed spec 0021)
- [x] Build it: `/develop AI listing descriptions`
  - [x] Draft service with the fact only prompt, daily limit, and refund on failure (AC-1, AC-2, AC-4, AC-5)
  - [x] "Draft with AI" in the editor with Undo; nothing saved until the agent saves (AC-3)
- [ ] Verify it: `/check verify AI listing descriptions`
- [ ] Test it: `/test AI listing descriptions`
Spec [0021](../specs/0021-ai-listing-descriptions/index.md) (Assumed) · code in `lib/server/listing-description.ts`, `app/dashboard/listings/[id]/listing-editor.tsx` · no migration

### 22. Agent dashboard overview · in-progress · assumed decision (spec 0022)
**Done when:** agents see weekly leads, the 30 day pipeline, and upcoming viewings on sign in.
- [ ] Design it (spec): `/architect agent dashboard overview` (ratify the assumed spec 0022)
- [x] Build it: `/develop agent dashboard overview`
  - [x] Overview service: 8 weekly counts, 30 day pipeline, next 5 viewings (AC-2 to AC-4)
  - [x] `/dashboard` page with empty states, Overview in the nav, agents land there (AC-1, AC-5)
- [ ] Verify it: `/check verify agent dashboard overview`
- [ ] Test it: `/test agent dashboard overview`
Spec [0022](../specs/0022-agent-dashboard-overview/index.md) (Assumed) · code in `app/dashboard/page.tsx`, `lib/server/dashboard-overview.ts` · no migration

## Slice 5: Outside sellers

### 23. Seller listing submission · needs a decision
**Done when:** a seller submits and edits a pending listing, hidden until approved.
- [ ] Design it (spec): `/architect seller listing submission`

### 24. Listing review & approval
**Done when:** agents approve, reject with a reason, or request changes, and the seller sees the outcome.
- [ ] Build it: `/develop listing review & approval`

## Slice 6: Revenue

### 25. Paid featured listings · in-progress · GA · assumed decision (spec 0023, placeholder)
**Done when:** a seller pays to feature a listing for a period; featuring starts on payment, ends on expiry, and failed or refunded payments don't feature.
- [ ] Design it (spec): `/architect paid featured listings` (after slice 5 and a merchant account: gateway, prices, behavior; spec 0023 is only a placeholder)
- [ ] Build it: `/develop paid featured listings`
  - [x] Preview page `/dashboard/featured`: no payment, no prices, no writes (spec 0023, AC-1 to AC-3)
  - [ ] Real payments and featuring (owed)
- [ ] Verify it: `/check verify paid featured listings`
- [ ] Test it: `/test paid featured listings`
- [ ] Review it: `/check review paid featured listings`
- [ ] Document it: `/document`
Spec [0023](../specs/0023-paid-featured-listings/index.md) (Assumed, placeholder) · code in `app/dashboard/featured/`, `lib/server/featured.ts` · no migration

## Deferred
- **Bangla site wide** (pages, not just chat) · needs a decision
- **Private valuation request** for owners
- **Agent availability calendar** for booking slots · needs a decision

## Legend
- **Decision box**: the one box per feature whose label ends in `(spec)`; skills find it by that suffix. Every other box is an execution box.
- **Next step** = first unticked box. Atomic tasks live in the spec's `## Build plan`; here only 2 to 5 milestones.
- **Status**: `planned` → `in-progress` → `done`, plus `existing` and `dropped`. `/scope` adds features; `/architect` ticks the decision box, links the spec, adds milestones and tier boxes; `/develop` ticks milestones and fills the code pointer; `/check verify` and `/test` tick theirs; **you** call `done`.
- **needs a decision** = `/architect` first; the tag drops once the spec exists.
- **Tier tag** (`· Prototype`, `· GA`) or **approach tag** (`· Facade`) on a heading overrides the project default. Tier boxes: Alpha adds `Verify it`, Beta adds `Test it`, GA adds `Review it` and `Document it`. An `Assumed` spec stays flagged but never blocks `done`.
- **Pointer line** `Spec <n> · code in <path>`: spec by `/architect`, code path by `/develop`.
