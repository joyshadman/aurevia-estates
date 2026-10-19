# Scope: Aurevia Estates

An AI powered real estate site for a curated agency in Sylhet. Signed in visitors (local buyers and families abroad) chat with an assistant in English or Bangla that learns what they need, matches them to real hand checked listings, and books a viewing that lands in an agent's lead inbox. Later, outside sellers can submit listings and pay to feature them.

**Build approach:** Tracer Bullet (build one thin, real thread through every layer first, then thicken one segment at a time, each end to end).
**Workflow:** Beta (after `/develop`: `/check verify`, then `/test`). The project default level of rigor. `/architect` is the recommended first stop for a feature with a real decision, but skippable when you already know the build. Any feature can carry its own tag (e.g. `· GA`) to do more or less.
**Success metric:** viewings booked through the assistant.
**Design reference:** the static mockups in `desing-check/aurevia-estates/` (homepage, discovery, property, assistant, about, admin).

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit: if you already know how to build a feature, use `/develop` and skip `/architect`. You decide when a feature is `done`._

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
| 17 | Privacy, terms & cookie consent | Slice 3 | planned |
| 18 | Analytics & error tracking | Slice 3 | planned |
| 19 | Booking & lead notifications | Slice 3 | planned |
| 20 | Listing photo upload | Slice 4 | planned |
| 21 | AI listing descriptions | Slice 4 | planned |
| 22 | Agent dashboard overview | Slice 4 | planned |
| 23 | Seller listing submission | Slice 5 | planned |
| 24 | Listing review & approval | Slice 5 | planned |
| 25 | Paid featured listings | Slice 6 | planned |

## Foundations

### 1. Stack & architecture · in-progress
A Next.js app with Tailwind is already scaffolded. Decide the rest of the stack (data store, auth, AI model access, hosting) and add only what the first slice needs.
**Done when:** the stack is recorded in a spec, and the app boots locally and passes build with the chosen core runtime in place.
- [x] Decide the stack (spec): `/architect stack & architecture`
- [ ] Scaffold from the decision: `/develop stack & architecture`
Spec [0001](../specs/0001-stack-architecture/index.md) · code in `app/`, `lib/`, `prisma/`, `proxy.ts` (scaffold written; boot against the database still to verify)

### 2. Coding standards & tooling
Capture conventions and tooling choices from the real project, then install lint, format, type strictness, and pre commit checks.
**Done when:** root `AGENTS.md` reflects the real stack, and lint, format, and pre commit run clean.
- [ ] Capture conventions + tooling choices: `/audit`

### 3. Data model · in-progress
Core entities every slice builds on: users with roles (visitor, agent, seller), listings (with status and a featured flag), conversations and messages, viewings, leads.
**Done when:** the entities support chat matching, booking, seller submission, and featuring without a breaking migration.
- [x] Design it (spec): `/architect data model`
- [x] Build it: `/develop data model`
  - [x] Slice 1 schema and migration with raw SQL constraints, RLS, and a clean drift check (AC-1, AC-3, AC-4, AC-14)
  - [x] Seed data for areas, amenities, and sample listings (AC-2)
  - [x] Listing domain: type rules, publish, search, photos, serialization (AC-3 to AC-6)
  - [x] Chat store, booking, AI usage, and status transitions, plus the profile tombstone (AC-7 to AC-11)
  - [x] Database tests for slice 1 (AC-1 to AC-11, AC-14)
- [x] Verify it: `/check verify data model`
- [ ] Test it: `/test data model`
Spec [0002](../specs/0002-data-model/index.md) · code in `prisma/`, `lib/domain/`, `lib/server/`, tests in `tests/db/`

### 4. Design system & UI foundation · in-progress
Turn the mockup theme (canvas, burgundy, plum, charcoal; Playfair Display, Inter, Hind Siliguri) into tokens and base components.
**Done when:** `design.md` covers type, color, spacing, and components, and base components meet WCAG AA (focus, keyboard, contrast).
- [x] Design it (spec): `/architect design system & UI foundation`
- [ ] Build it: `/develop design system & UI foundation`
  - [x] Thin thread: tokens for both themes, fonts, theme script, Button, header shell, `/styleguide`, lint and axe (AC-1, AC-3, AC-4, AC-7, AC-8, AC-10, AC-11, AC-13)
  - [x] Base kit: controls, overlays, toasts, feedback states (AC-2, AC-8, AC-9, AC-11, AC-16)
  - [x] Site chrome and listing pieces: header, mobile menu, footer, account slot, property card (AC-6, AC-12, AC-13, AC-14)
  - [ ] Account theme sync after sign in exists (AC-5, AC-6)
  - [x] Root `design.md` (AC-15)
- [ ] Verify it: `/check verify design system & UI foundation`
- [ ] Test it: `/test design system & UI foundation`
Spec [0003](../specs/0003-design-system-ui-foundation/index.md) · code in `app/globals.css`, `components/`, `lib/`, `design.md`

## Slice 1: Core loop (chat to booked viewing)

The thinnest real thread: a visitor signs in, chats, gets matched to real listings, books a viewing, and an agent sees it. This slice is the walking skeleton.

### 5. Visitor & agent sign in · in-progress · GA
Accounts are required to chat; agents sign in with their own role. Holds personal data, so it gets extra rigor.
**Done when:** a visitor can sign up, sign in, and sign out; an agent signs in to agent only pages; a visitor cannot reach them.
- [x] Design it (spec): `/architect visitor & agent sign in`
- [ ] Build it: `/develop visitor & agent sign in`
  - [ ] Email code thread: helpers, `/sign-in`, `/auth/confirm`, Send Email Hook, sign out (AC-1, AC-2, AC-6, AC-11, AC-12, AC-13, AC-15)
  - [ ] Bot protection: hCaptcha, rate limits, auth config runbook (AC-2, AC-4)
  - [ ] Password and Google sign in, forgot password (AC-3, AC-4, AC-5, AC-6, AC-7, AC-13)
  - [ ] Agent gate: MFA, `/mfa`, security page, scripts (AC-7, AC-8, AC-9, AC-14)
  - [ ] Account page: profile, password, linked methods, sign out everywhere (AC-10, AC-13, AC-15)
- [ ] Verify it: `/check verify visitor & agent sign in`
- [ ] Test it: `/test visitor & agent sign in`
- [ ] Review it (fresh model): `/check review visitor & agent sign in`
- [ ] Document it: `/document visitor & agent sign in`
Spec [0004](../specs/0004-visitor-agent-sign-in/index.md) · code in `lib/server/auth.ts`, `lib/server/sign-in.ts`, `lib/domain/auth-rules.ts`, `app/(auth)/`, `app/account/`, `proxy.ts`, `scripts/agent-access.ts`, runbook `docs/runbooks/auth-config.md`. Built without new keys: password sign up and sign in with the code step, `/auth/confirm`, forgot password, sign out (both scopes), the full agent gate with MFA, `/mfa`, `/account/security`, the account page, and the operator scripts. Waiting on keys: email code sign in and the Send Email Hook, hCaptcha, Google, Sentry; `mfa:reset` can't end sessions yet

### 6. Agent listing management · in-progress
A minimal agent form to create, edit, and unpublish listings (price, area, beds, baths, size, amenities, photo links) so the assistant has real homes to match.
**Done when:** an agent can create and edit a listing, and only published listings are visible to the assistant.
- [x] Design it (spec): `/architect agent listing management`
- [x] Build it: `/develop agent listing management`
  - [x] Thin thread: draft migration, create, minimal edit, publish to search (AC-2, AC-5, AC-15)
  - [x] Full form: type fields, amenities, price, conflict checks, read only mode (AC-3, AC-4, AC-6, AC-9, AC-12, AC-13, AC-14)
  - [x] Photo links and Maps location parsing (AC-7, AC-8, AC-13)
  - [x] Lifecycle and reassign, with lead moves and cache refresh (AC-10, AC-11, AC-12, AC-13)
  - [x] Listing table: tabs, search, mine toggle, paging (AC-1)
- [ ] Verify it: `/check verify agent listing management`
- [ ] Test it: `/test agent listing management`
Spec [0005](../specs/0005-agent-listing-management/index.md) · code in `app/dashboard/`, `lib/server/agent-listings.ts`, `lib/server/photo-links.ts`, `lib/server/location.ts`, `lib/domain/publish-checklist.ts`, tests in `tests/db/agent-listings.test.ts` (built against a stand in agent gate; MFA and a real sign in arrive with feature 5)

### 7. AI home finder chat · in-progress · GA
The heart of the product: the assistant asks about budget, area, family size, and lifestyle, in English or Bangla, then recommends matching published listings as cards.
**Done when:** a signed in visitor can chat in either language, gets only real matching listings (never invented ones), and the conversation is saved to their account.
- [x] Design it (spec): `/architect AI home finder chat`
- [ ] Build it: `/develop AI home finder chat`
  - [ ] Tools, scoring, and the model eval gate, no UI (AC-1, AC-3, AC-5, AC-6, AC-7, AC-8)
  - [x] Thin chat: streaming turn, saves, cards with current data (AC-2, AC-4, AC-15, AC-18)
  - [x] Daily limit, interrupted replies, Retry, and Stop (AC-9, AC-10, AC-15)
  - [x] Full chat page: panes, conversations, brief, Show more, chips, starting points (AC-4, AC-11, AC-12, AC-13, AC-16, AC-17)
  - [x] Agency fact sheet editor with versions (AC-14)
- [ ] Verify it: `/check verify AI home finder chat`
- [ ] Test it: `/test AI home finder chat`
- [ ] Review it (fresh model): `/check review AI home finder chat`
- [ ] Document it: `/document AI home finder chat`
Spec [0006](../specs/0006-ai-home-finder-chat/index.md) · code in `app/api/chat/`, `app/assistant/`, `components/assistant/`, `lib/server/assistant/`, `lib/server/conversations.ts`, `lib/server/fact-sheet.ts`, `app/dashboard/assistant-facts/`, tests in `tests/db/assistant.test.ts`, `tests/db/conversations.test.ts` (milestone 1 code is in; its eval gate waits for an OpenRouter key)

### 8. Viewing booking from chat · in-progress
From a recommended listing, the visitor picks a time and the assistant confirms a viewing, like the mockup's booking confirmation.
**Done when:** a visitor can book a viewing for a listing inside the chat, sees a confirmation, and the booking is stored as a lead.
- [x] Design it (spec): `/architect viewing booking from chat`
- [ ] Build it: `/develop viewing booking from chat`
  - [x] Thin thread: slots, `offerViewing`, booking card, `requestViewing`, confirmation card (AC-1 to AC-5, AC-12)
  - [x] Reuse and history: already booked, contact refresh, caps, live cards, model notes, the chip (AC-6, AC-7, AC-8, AC-10, AC-13)
  - [x] Visitor change and cancel with the 2 hour rule and change cap (AC-9, AC-10)
  - [x] Account "Your viewings" and the WhatsApp tick (AC-11)
  - [ ] Three new eval cases, rerun (AC-14)
- [ ] Verify it: `/check verify viewing booking from chat`
- [ ] Test it: `/test viewing booking from chat`
Spec [0007](../specs/0007-viewing-booking-from-chat/index.md) · code in `lib/server/viewing-bookings.ts`, `lib/server/bookings.ts`, `lib/domain/viewing-slots.ts`, `app/assistant/booking-actions.ts`, `components/assistant/booking-card.tsx`, `components/assistant/viewing-card.tsx`, `app/account/`, tests in `tests/db/viewing-bookings.test.ts` (the eval waits for an OpenRouter key; the wider deletion scrub lands with feature 17)

### 9. Agent lead inbox · in-progress
A list of booked viewings and their chat context so an agent can follow up.
**Done when:** an agent sees new viewings with visitor contact, listing, time, and a link to the conversation, and can mark a lead contacted.
- [x] Build it: `/develop agent lead inbox`
- [ ] Verify it: `/check verify agent lead inbox`
- [ ] Test it: `/test agent lead inbox`
Spec [0008](../specs/0008-agent-lead-inbox/index.md) · assumed decision (spec 0008) · code in `app/dashboard/leads/`, `lib/server/lead-inbox.ts`, tests in `tests/db/lead-inbox.test.ts`

## Slice 2: Public discovery

### 10. Property details page · in-progress
The full listing page from the mockup: gallery, specs, amenities, around the address, similar homes, and a "chat about this home" entry.
**Done when:** each published listing has a fast, shareable page with SEO metadata and social cards, and opening the chat from it starts with that listing in context.
- [x] Design it (spec): `/architect property details page`
- [x] Build it: `/develop property details page`
  - [x] Thin thread: cached read, page with a real 404 and the sold treatment, chat entry, chat cards linking here (AC-1, AC-2, AC-3, AC-7, AC-11)
  - [x] Full page: gallery and viewer, amenities, specifications, location, advisor card, Share (AC-1, AC-4, AC-6, AC-9, AC-12, AC-13, AC-14)
  - [x] Similar homes (AC-5, AC-7)
  - [x] Metadata and the generated share card; agent preview (AC-3, AC-8, AC-10)
- [ ] Verify it: `/check verify property details page`
- [ ] Test it: `/test property details page`
Spec [0009](../specs/0009-property-details-page/index.md) · code in `app/properties/[slug]/`, `components/property/`, `lib/server/public-listings.ts`, `lib/server/share-card.tsx`, `app/dashboard/listings/[id]/preview/`, tests in `tests/db/public-listings.test.ts` (unknown slugs are a soft 404 with noindex, accepted)

### 11. Property search & filters · in-progress
The discovery page: filter by area, price, type, and beds, with grid and list views.
**Done when:** a visitor can filter listings, the URL reflects the filters, and empty and error states render.
- [x] Design it (spec): `/architect property search & filters`
- [x] Build it: `/develop property search & filters`
  - [x] Thin thread: URL to cached search to cards, the Buy link live (AC-1, AC-3, AC-4, AC-14, AC-16)
  - [x] Filter panel, keyword, sort, views, chips (AC-2, AC-5, AC-9, AC-12)
  - [x] Counts, the phone sheet, and paging (AC-5, AC-6, AC-7, AC-8, AC-15)
  - [x] Empty and error states, the assistant handoff, indexing rules (AC-10, AC-11, AC-13, AC-15)
- [ ] Verify it: `/check verify property search & filters`
- [ ] Test it: `/test property search & filters`
Spec [0010](../specs/0010-property-search-filters/index.md) · code in `app/properties/page.tsx`, `components/search/`, `lib/domain/search-params.ts`, `lib/server/public-search.ts`, tests in `tests/db/public-search.test.ts`

### 12. Homepage · in-progress
The marketing homepage from the mockup with featured homes, the "describe the home" entry into chat, and trust sections.
**Done when:** the homepage shows live published listings, and the describe box hands its text to the assistant after sign in.
- [x] Build it: `/develop homepage`
- [ ] Verify it: `/check verify homepage`
- [ ] Test it: `/test homepage`
Spec [0012](../specs/0012-homepage/index.md) · assumed decision (spec 0012) · code in `app/page.tsx`, `components/home/`, `lib/server/home.ts`, `lib/content/home.ts`, tests in `tests/db/home.test.ts`

### 13. Map view · in-progress
Show listings on a map in discovery and the "around the address" area on property pages.
**Done when:** listings appear as pins that link to their pages, and each property page shows its location and nearby places.
- [x] Design it (spec): `/architect map view`
- [ ] Build it: `/develop map view`
  - [x] Search Map view: lazy MapLibre map, clustered price pins, cards, brand style, fallback (AC-1, AC-2, AC-3, AC-8, AC-9, AC-10, AC-11, AC-12)
  - [x] Property page map: static preview, interactive on tap (AC-4, AC-8, AC-9, AC-10)
  - [x] Nearby places: table, editor section, page list (AC-5, AC-6, AC-11)
  - [ ] Assistant answers from nearby places, eval rerun (AC-7) · built; the eval rerun waits on the OpenRouter key
- [ ] Verify it: `/check verify map view`
- [ ] Test it: `/test map view`
Spec [0011](../specs/0011-map-view/index.md) · code in `lib/maps.ts`, `lib/maps/style.json`, `components/maps/`, `searchMapPoints` in `lib/server/public-search.ts`, `app/dashboard/listings/[id]/nearby-places-field.tsx`, tests in `tests/db/maps.test.ts`

### 14. Saved homes · in-progress
Visitors heart listings (from cards, pages, or chat) and find them again in their account.
**Done when:** a signed in visitor can save and unsave a listing and see a saved homes list.
- [x] Build it: `/develop saved homes`
- [ ] Verify it: `/check verify saved homes`
- [ ] Test it: `/test saved homes`
Spec [0013](../specs/0013-saved-homes/index.md) · assumed decision (spec 0013) · code in `lib/server/saved-homes.ts`, `app/saved/`, `components/listing/save-heart.tsx`, `components/listing/saved-store.ts`, `components/assistant/side-pane.tsx`, `components/chrome/account-slot.tsx`, tests in `tests/db/saved-homes.test.ts`

### 15. About & contact · in-progress
The agency story, team, office details, and a contact form that becomes a lead.
**Done when:** the page renders from the mockup, and a submitted contact form appears in the agent lead inbox.
- [x] Build it: `/develop about & contact`
- [ ] Verify it: `/check verify about & contact`
- [ ] Test it: `/test about & contact`
Spec [0014](../specs/0014-about-contact/index.md) · assumed decision (spec 0014) · code in `app/about/`, `components/about/`, `lib/content/about.ts`, `lib/server/contact.ts`, `lib/server/captcha.ts`, `lib/server/about.ts`, tests in `tests/db/contact.test.ts`

### 16. SEO baseline · in-progress
Site wide search basics on top of the property pages.
**Done when:** a sitemap lists every published listing and public page, robots rules are set, and listings carry structured data.
- [x] Build it: `/develop SEO baseline`
- [ ] Verify it: `/check verify SEO baseline`
- [ ] Test it: `/test SEO baseline`
Spec [0015](../specs/0015-seo-baseline/index.md) · assumed decision (spec 0015) · code in `app/sitemap.ts`, `app/robots.ts`, `lib/server/sitemap.ts`, `lib/domain/structured-data.ts`, `components/seo/json-ld.tsx`, tests in `tests/db/seo.test.ts`

## Slice 3: Launch readiness

### 17. Privacy, terms & cookie consent · needs a decision · GA
Legal pages and consent, needed because the site stores accounts, chats, and later payments.
**Done when:** privacy and terms pages exist, non essential tracking waits for consent, and a user can request deletion of their account and chats.
- [ ] Design it (spec): `/architect privacy, terms & cookie consent`

### 18. Analytics & error tracking · needs a decision
Measure the funnel (chat started, listing recommended, viewing booked) and catch errors in production.
**Done when:** the funnel events are recorded with consent, viewings booked via chat can be counted, and production errors are reported.
- [ ] Design it (spec): `/architect analytics & error tracking`

### 19. Booking & lead notifications · needs a decision
Confirm bookings to visitors and alert agents to new leads.
**Done when:** a visitor gets a booking confirmation, the assigned agent gets a new lead alert, and failed sends are retried or logged.
- [ ] Design it (spec): `/architect booking & lead notifications`

## Slice 4: Agent tools

### 20. Listing photo upload · needs a decision
Agents upload listing photos instead of pasting links, with ordering and a cover photo.
**Done when:** an agent can upload, reorder, and remove photos, and pages load sized images.
- [ ] Design it (spec): `/architect listing photo upload`

### 21. AI listing descriptions · needs a decision
The dashboard helper from the mockup that drafts a listing description from its details for the agent to edit.
**Done when:** an agent can generate a draft from a listing's fields, edit it, and save it; nothing publishes without the agent's approval.
- [ ] Design it (spec): `/architect AI listing descriptions`

### 22. Agent dashboard overview
The dashboard home from the mockup: weekly leads, 30 day pipeline, and upcoming viewings.
**Done when:** an agent sees live counts and upcoming viewings on sign in.
- [ ] Build it: `/develop agent dashboard overview`

## Slice 5: Outside sellers

### 23. Seller listing submission · needs a decision
Owners and other agencies sign up as sellers and submit a listing for review.
**Done when:** a seller can submit and edit a pending listing, and it stays hidden until approved.
- [ ] Design it (spec): `/architect seller listing submission`

### 24. Listing review & approval
Agents review seller submissions to keep the "every listing checked by hand" promise.
**Done when:** an agent can approve, reject with a reason, or request changes, and the seller sees the outcome.
- [ ] Build it: `/develop listing review & approval`

## Slice 6: Revenue

### 25. Paid featured listings · needs a decision · GA
Sellers pay to feature an approved listing, which ranks it higher in discovery and on the homepage.
**Done when:** a seller can pay to feature a listing for a set period, featuring starts on successful payment and ends on expiry, and failed or refunded payments do not feature.
- [ ] Design it (spec): `/architect paid featured listings`

## Deferred
Out of scope for the current build pass, kept so the plan stays honest.
- **Bangla site wide**: translate pages, not just the chat (the mockup toggle) · needs a decision
- **Private valuation request**: the homepage "start with a private valuation" flow for owners
- **Agent availability calendar**: real agent schedules for booking slots instead of a simple time pick · needs a decision

## Legend

**The decision box.** Every feature carries exactly one, the sub task whose label ends with `(spec)`. Its wording varies (`Design it (spec)` normally, `Decide the stack (spec)` on Stack & architecture), so skills locate it by that `(spec)` suffix, never by an exact label. Every other box is an execution box and `/architect` never ticks one.

**Feature lifecycle**: the scope updates as a feature moves; each row is what it shows and who sets it:

| State | Set by | The feature shows |
|---|---|---|
| `planned` · needs a decision | `/scope` | one box: `Design it (spec): /architect <feature>` |
| `in-progress` (designed) | **`/architect` at spec capture** | `Design it` ticked; spec linked; `Build it: /develop <feature>` + **2 to 5 milestones**; the tier's closing boxes (`Verify it` Alpha+, `Test it` Beta+, `Review it` + `Document it` GA); any surfaced follow up enrolled |
| `in-progress` (building) | `/develop` | milestone sub boxes tick one by one; code pointer filled |
| `in-progress` (verified) | `/check verify` | `Build it` + milestones ticked; `Verify it` ticked |
| `done` | **you, when you decide it is** (any skill sets it when you say so); `/sync` reconciles | boxes you ran ticked, skipped ones marked skipped; the tier's last stage (`Prototype` → after `/develop`; `Alpha` → after `/check verify`; `Beta`/`GA` → after `/test`) is the suggested point to call it done; `/sync` captures conventions |

- **Next step** = the first unticked box (always a command or a tracked milestone).
- **needs a decision** = run `/architect` first; otherwise straight to `/develop` (or `/audit` for standards & tooling). The tag drops once the spec is captured.
- **Atomic build tasks live in the spec's `## Build plan`, not here**: the scope carries only the milestone rollup.
- **Status** `planned` → `in-progress` → `done`, plus `existing` (pre workflow) and `dropped` (de scoped, kept for history).
- **Approach tag** beside a heading (e.g. `· Facade`) overrides the project default for that feature; no tag = inherits it.
- **Workflow tier tag** beside a heading (e.g. `· GA`, `· Prototype`) sets that one feature's rigor above or below the project default; no tag inherits the default. It decides the feature's check boxes and each skill's next suggestion.
- **Workflow** (header line) is the project default, what runs after `/develop`: **Prototype** = nothing (trust develop's own build time self check); **Alpha** = `/check verify`; **Beta** = `/check verify` then `/test`; **GA** = adds a fresh model `/check review` then `/document`. A feature built on an unratified decision (an `Assumed` spec) stays flagged, but that never blocks `done`.
- **Pointer line** (`spec <n> · code in <path>`): the spec link added by `/architect`, the code path by `/develop`.
