# 0011 · Homepage

**Status**: Assumed
**Date**: 2026-10-26
**Authorized by**: joyshadman, during /develop ("update scope and develop recommended decision")

## Owed decision
The mockup (`desing-check/aurevia-estates/index.html`) fixes the look, but several homepage values had no source: which listings are "featured" (the schema has no featured flag; paid featuring is feature 25), what stands in for the mockup's invented stats, testimonials, and agency claims, which images the hero and category tiles use, and where the valuation call to action goes (private valuation is deferred).

## Assumption built on
- **Public and cached.** `/` reads no cookies (root `AGENTS.md`). Its data comes from one `"use cache"` read tagged `listings` (cache life hours), so a publish or unpublish shows on the next load.
- **Only real data and true claims.** No invented numbers, quotes, or agency facts are published.
- **Sections, top to bottom** (mockup order, minus testimonials):
  1. **Hero**: eyebrow, headline, and intro copy from the mockup, minus unverifiable claims. The background is the cover photo of the newest published listing, and the glass card names that listing ("Newest on Aurevia": title, area, a spec line, price). With no listings, a plum panel and no card. Buttons: "Explore residences" → `/properties`, "Ask the Aurevia Assistant" → `/assistant`.
  2. **Search panel**: location (active areas), property type, max budget (spec 0010's price steps, sent as `max`), and beds (Any, 2+ to 5+). A GET form to `/properties` using spec 0010's params. No Buy, Rent, or New projects tabs (every listing is SALE).
  3. **"Selected this season"**: the 6 newest published listings as `PropertyCard`s with spec 0010's "Ask about this home" button, plus "View all homes" → `/properties`. Feature 25 replaces this with paid featuring. Hidden when there are no listings.
  4. **Assistant promo**: headline and copy from the mockup. The describe box is a GET form to `/assistant` with `q` (spec 0006 prefills the chat; sign in keeps `q` in `next`), so the text reaches the assistant after sign in. Three suggestion chips link to `/assistant?q=<chip>`, one in Bangla (`lang="bn"`). The preview panel is labelled "Example" and shows a sample question plus a real listing card (the second newest listing).
  5. **"Browse by residence"**: up to four tiles, one per property type with published listings, by count (most first). Each shows the type, a live count, a live "from" price, and the cover photo of that type's newest listing. Each links to `/properties?type=<type>`.
  6. **"Why Aurevia"**: four points the product actually delivers: every listing checked by hand before it goes live, an assistant in English or বাংলা, viewings booked straight with an advisor, and WhatsApp follow up for families abroad. No legal, approval, or rejection rate claims until the agency confirms them.
  7. **Live stats**: verified homes (published count), neighbourhoods (areas with a published home), homes from (lowest published price), languages (English · বাংলা).
  8. **Advisor call to action**: "Talk to an advisor" replaces the private valuation (deferred). It links to `/assistant`, with no phone number until the agency gives one. The image is a listing cover, else the plum panel.
- **No testimonials section** until real, permitted quotes exist.
- **Copy** is drafted from the mockup and flagged for the agency to review.

## Code area
`app/page.tsx`, `lib/server/homepage.ts`, the media color tokens in `app/globals.css` (with `design.md` and `/styleguide`)

## Requirements
- **AC-1**: the homepage shows only live published listings: the hero listing, 6 newest, category tiles, and the example card. It hides each listing section when there are no listings.
- **AC-2**: the describe box and the chips open `/assistant` with their text; signed out visitors sign in first and land in the chat with the text in the box.
- **AC-3**: the search panel opens `/properties` with the chosen filters in the URL.
- **AC-4**: every number shown is computed from the database; there are no testimonials and no unverifiable claims.
- **AC-5**: the page reads no cookies and is cached under the `listings` tag.
- **AC-6**: it works at phone width, in light and dark, and with the keyboard (WCAG 2.2 AA, `design.md`).

## Ratify
This decision was recorded by /develop, not deliberated. Run `/architect homepage` to deliberate and ratify it. Until then it stays flagged as an owed decision; it does not block marking the feature `done`.
