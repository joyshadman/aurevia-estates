# 0012 · Homepage

**Status**: Assumed
**Date**: 2026-10-19
**Authorized by**: Joy Shadmane, during /develop

## Owed decision
The homepage's sections, what "featured" means before paid featuring exists (feature 25), where its images come from, and what to do with the mockup's business statistics and testimonials. `design.md` sets the look and `desing-check/aurevia-estates/index.html` the composition, but no spec pins the content or the data sources.

## Assumption built on
Sections, in order, from the mockup:
1. **Hero**: eyebrow "Private residences · Sylhet", the headline "Homes framed by tea hills and quiet light.", a short paragraph, "Explore homes" (`/properties`) and "Ask the Aurevia Assistant" (`/assistant`). Beside it, a "Featured this month" card: the newest PUBLISHED listing's cover, title, area, a key fact, and price, linking to its page (spec 0009).
2. **Quick search**: Location (active areas), Property type, Budget (spec 0010's price presets as a maximum), Bedrooms (1+ to 5+); "Search" opens `/properties` with those values in the URL (spec 0010).
3. **Featured residences**: the 3 newest PUBLISHED listings as spec 0003 cards with price per sqft, and "View all N homes" (`/properties`, N = published count). Until feature 25, "featured" means newest; feature 25 replaces the source with paid featured listings first.
4. **Assistant promo**: "Describe the home. We'll find the address.", a describe box (up to 500 characters) whose "Ask" opens `/assistant?q=<text>` (spec 0006 fills the composer without sending; signed out visitors go through sign in and come back to the same address), and three example chips that fill the box ("Which areas suit a family with school age kids?", "Villas with tea garden views", "জিন্দাবাজারে ফ্ল্যাট আছে?").
5. **Browse by type**: one tile per property type with at least one PUBLISHED listing, showing "<N> homes · from BDT <lowest price>" and the newest listing's cover of that type, linking to `/properties?type=<type>`.
6. **Why Aurevia**: four points, each true of what is built: every listing checked by an agent before it goes live; price per sqft on every home; an assistant in English and বাংলা that only shows real listings; advisors in Sylhet who confirm viewings by phone or WhatsApp. The copy lives in `lib/content/home.ts` for the agency to edit.

Left out until the agency supplies real, confirmed figures and consented quotes: the statistics band (sold value, families housed, days to close, rating) and the testimonials.

Data: all listing data comes from cached reads tagged `listings` (spec 0005 refreshes them). The page reads no session. The hero copy prerenders; the data sections stream in behind `<Suspense>` after `connection()`, so the build never needs the database. With no published listings, the featured card, featured residences, and type tiles are hidden and the hero still shows. Images: listing covers only (no stock photos); a missing cover shows spec 0003's framed house icon. Metadata: title "Aurevia Estates · Hand checked homes in Sylhet", the root description, canonical `NEXT_PUBLIC_SITE_URL/`.

## Code area
`app/page.tsx`, `components/home/`, `lib/content/home.ts`, `lib/server/home.ts`, `tests/db/home.test.ts`

## Requirements
- The homepage shows live published listings (scope, Done when).
- The describe box hands its text to the assistant after sign in (scope, Done when).

## Ratify
This decision was recorded by /develop, not deliberated. Run `/architect homepage`
to deliberate and ratify it. Until then it stays flagged as an owed decision; it does not block marking the feature `done`.
