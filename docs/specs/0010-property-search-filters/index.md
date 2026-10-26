# 0010 · Property search & filters

**Status**: Assumed
**Date**: 2026-10-26
**Authorized by**: joyshadman, during /develop ("make the recommended decision")

## Owed decision
What the public discovery page does: its URL shape, which filters it offers and how they are entered, sort orders, paging, what a card links to before the property page exists (feature 10), and how it stays cacheable.

## Assumption built on
- **Route**: `/properties`, public. It never reads cookies or calls the auth helper (root `AGENTS.md`). Only `PUBLISHED` listings. Every listing is `SALE` (the only `DealType`), so the nav's "Buy" entry goes live and there are no Buy/Rent tabs.
- **URL is the state** (shareable, works without JavaScript). Params, all optional:
  - `q`: keyword, 1 to 80 characters. Matches title (contains, any case), area English name (contains, any case), or an exact ref code through `normalizeRefCode` (`aur 1042` → AUR-1042).
  - `area`: area slug, repeatable (any of). Unknown slugs are ignored.
  - `type`: property type in lowercase (`apartment`, `duplex`, `villa`, `house`, `plot`, `commercial`), repeatable (any of).
  - `min`, `max`: whole taka. The form offers preset steps (25, 50, 75 lakh; 1, 1.5, 2, 3, 5, 7, 10 crore). If min is above max, the two are swapped.
  - `beds`: 1 to 5, meaning "this many or more" (plots and commercial have no bedrooms, so they drop out).
  - `amenity`: amenity slug, repeatable (all of).
  - `sort`: `newest` (default, `published_at` desc), `price_asc`, `price_desc`; ties by `published_at` desc, then id.
  - `view`: `grid` (default) or `list`. Anything else, including `map` (feature 13), falls back to grid.
  - `page`: 1 based, 12 per page, offset paging with a total count ("Showing 1–12 of 24"). A page past the end shows the empty state with a link to page 1.
  - Invalid values are dropped, never an error.
- **Filters UI**: one GET form (the sidebar from the mockup's `properties.html`): location checkboxes with each area's published count, price min and max selects, beds as radios (Any, 1+ to 5+), property type checkboxes, amenity checkboxes, Reset and "Show homes". Below `lg` the panel is a `details` element, closed by default. Sort is a select that applies on change (JavaScript), with the same form as a fallback. Active filters show as removable chips plus "Clear all".
- **Cards**: `PropertyCard` without `href` until feature 10. The card footer has "Ask about this home" → `/assistant?listing=<slug>` (spec 0006's start listing). Feature 10 adds the `href`.
- **Caching**: the result query, the counts, and the filter options run in `"use cache"` functions tagged `listings` (cache life hours), which listing writes already refresh (spec 0005). `searchParams` is read inside a `Suspense` boundary.
- **States**: loading skeleton (Suspense), empty state ("No homes match" with Clear filters and "Describe it to the assistant"), and an `error.tsx` with Retry.

## Code area
`app/properties/`, `lib/server/discovery.ts`, `lib/domain/discovery.ts`, `lib/nav.ts`

## Requirements
- **AC-1**: `/properties` lists published listings only, 12 per page, newest first by default, with a total count.
- **AC-2**: area, type, price range, beds, amenities, and keyword filters narrow the results as described above; they combine with AND across kinds.
- **AC-3**: the URL reflects every filter, sort, view, and page; loading the URL reproduces the page; invalid params are dropped.
- **AC-4**: sort by newest, price low to high, and price high to low.
- **AC-5**: grid and list views.
- **AC-6**: empty, loading, and error states render.
- **AC-7**: the page reads no cookies and is cached under the `listings` tag, so a publish or unpublish shows on the next load.

## Ratify
This decision was recorded by /develop, not deliberated. Run `/architect property search & filters` to deliberate and ratify it. Until then it stays flagged as an owed decision; it does not block marking the feature `done`.
