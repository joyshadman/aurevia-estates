# 0010. Property search and filters

**Date**: 2026-10-19
**Status**: In Progress

## Summary

`/properties` becomes the public discovery page: a keyword box (areas, titles, codes), filters for area, price (lakh and crore presets), property type, minimum bedrooms, and amenities, three sort orders, grid and list views, and 24 homes at a time with "Show more homes". Every filter lives in the URL, so a search can be shared and the back button works; the base page and single area pages are indexed by search engines, other combinations are not. It reuses spec 0002's published listing search, adds sorting by price and live counts per area and type, and offers a "Describe it instead" path into the assistant with the filters turned into a sentence.

## Requirements

**User stories**:
- As a buyer, I want to filter homes by area, budget, type, bedrooms, and must haves, so I only see what fits.
- As a buyer, I want to share a search link with my family, and come back to it.
- As a buyer, I want to switch between a grid of photos and a denser list.
- As a buyer who'd rather describe what I want, I want to hand my filters to the assistant.

**Acceptance criteria**:
- **AC-1**: `/properties` lists PUBLISHED listings only (never sold, draft, or any other status) as spec 0003 `PropertyCard`s linking to `/properties/<slug>` (spec 0009), 24 at a time, with the total ("24 homes match"). Each card also shows the price per built up sqft (whole taka) when the home has a size.
- **AC-2**: Filters, all optional and combinable: areas (any number, matching any), property types (any number), price minimum and maximum from presets (Any, 25 lakh, 50 lakh, 75 lakh, 1 crore, 1.5, 2, 3, 5, 7, 10 crore), minimum bedrooms (Any, 1+, 2+, 3+, 4+, 5+; homes without bedrooms drop out when set), and amenities (every chosen one must be present). A price that isn't a preset is ignored; when the maximum is below the minimum, the maximum is dropped.
- **AC-3**: Keyword box: the text, trimmed, case insensitive, up to 80 characters. When it exactly equals an active area's English name, Bangla name, or slug, that area joins the area filter (and titles are not searched). When it is a listing code (`AUR-1042`, any case, Bangla digits allowed), only that code matches, combined with the other filters. Otherwise it matches listings whose title contains it (English or Bangla, Prisma `contains` with `mode: "insensitive"`, so `%` and `_` are literal). The keyword shows as its own chip.
- **AC-4**: The URL holds the whole search: `area` (slug, repeatable), `type` (lowercase type, repeatable), `min` and `max` (whole taka, preset values only), `beds` (1 to 5), `amenity` (slug, repeatable), `q`, `sort` (`newest` default, `price-asc`, `price-desc`), and `view` (`grid` default, `list`). Opening a URL restores the same search and view; unknown or invalid values are ignored without an error (an unknown or inactive area slug, a non preset price, a type outside the six). `type` is lowercase in the URL and uppercase in queries. Default values are left out of the URL, and repeated values are written sorted by slug, so one search has one canonical URL.
- **AC-5**: Sort: newest published first (default), price low to high, price high to low; ties broken the same way every time, so paging never repeats or skips a home.
- **AC-6**: "Show more homes" appends the next 24 for the same search and sort, without changing the URL; it disappears when there are no more. If loading fails, a "Couldn't load more homes" message with Try again shows under the results, and the loaded results stay.
- **AC-7**: Counts: each area and each property type option shows how many PUBLISHED homes match the other active filters, including the keyword and code (the area counts ignore the area filter itself; the type counts ignore the type filter). Every active area is listed in its display order and all six types always appear; options with 0 are dimmed but stay selectable.
- **AC-8**: Applying filters: from the `lg` breakpoint, filters sit in a side panel and each change updates the URL and results at once (replacing the history entry for each change while typing the keyword, pushing one for the other controls). Below `lg`, a "Filters (N)" button opens a bottom sheet (spec 0003 `Dialog` placement `bottom`) whose "Show N homes" button, with a live count from `countListingsAction`, applies the choices together; "Reset" clears them. "Filters (N)" counts the chosen values. The keyword box updates the URL 300 ms after typing stops.
- **AC-9**: Active filters show as removable chips above the results ("Tilagor ✕", "BDT 50 lakh to 1.5 crore ✕", "3+ beds ✕"), with "Clear all". Price chips read "From 50 lakh", "Up to 1.5 crore", or "50 lakh to 1.5 crore"; the keyword chip shows the typed text in quotes.
- **AC-10**: Empty and error states: no results shows "No homes match these filters" with "Clear filters" and "Describe it to the assistant" (AC-11). A failure loading the page shows spec 0003 `ErrorState` with Try again, through the route's `error.tsx` boundary.
- **AC-11**: Assistant: "Describe it instead" by the keyword box, and a card after the 6th result, open `/assistant?q=<sentence>` with the current filters written as a sentence (for example "I'm looking for a 3+ bedroom apartment in Tilagor or Uposhohor, between BDT 50 lakh and 1.5 crore, with a lift."), or "I'm looking for a home in Sylhet." with no filters, cut to 500 characters. Spec 0006 fills the composer without sending.
- **AC-12**: Views: a grid and list toggle (`view`), grid by default, using spec 0003's `PropertyCard` layouts.
- **AC-13**: Search engines: `/properties` (title "Homes for sale in Sylhet") and `/properties?area=<slug>` with only that one parameter (title "Homes for sale in <area>") are indexable, each with its canonical URL from `NEXT_PUBLIC_SITE_URL`; every other combination (including an unknown or inactive area, and `sort` or `view` alone) is `noindex, follow` with its canonical pointing to `/properties`.
- **AC-14**: Results always reflect the current listings: a publish, unpublish, sale, or price change (spec 0005) shows on the next request, including in counts.
- **AC-15**: The page meets WCAG 2.2 AA (spec 0003): filters are labelled fieldsets, chips and toggles are buttons with names, the result count is announced politely after each change, focus stays on the control that changed, and "Show more homes" moves focus to the first new result.
- **AC-16**: The header's "Buy" link goes live (spec 0003 `lib/nav.ts`) and points to `/properties`.

## Decision

**Chosen option**: Option 1: One server rendered page with URL state over the existing search.

`/properties` renders the search from its URL on the server through a cached extension of spec 0002's `searchPublishedListings`, with facet counts, three sorts, and "Show more homes" through a public server action.

**Implementation skills**: `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`) · `prisma-client-api` (`prisma/skills`, `.claude/skills/prisma-client-api/`) · `supabase-postgres-best-practices` (`supabase/agent-skills`, `.claude/skills/supabase-postgres-best-practices/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:
No new tables or columns. `price_bdt` is never null on PUBLISHED rows (spec 0005's database check), so price sorting and its keyset need no null handling. One index for the price sorts (migration `search_price_sort`):
- `listings (status, price_bdt, id)` btree, used by `price-asc` and `price-desc` keyset paging over PUBLISHED rows.

Reads spec 0002 tables: `listings`, `listing_photos` (cover), `listing_amenities`, `areas` (`slug`, `name_en`, `name_bn`, `is_active`, `sort_order`), `amenities` (`slug`, `label`, `is_active`, `sort_order`).

**State transitions**: none. Only `listings.status = PUBLISHED` is ever shown.

**API surface**:
| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/properties` | page (GET) | URL params of AC-4 | first 24 cards, total, facet counts, chips, metadata | public, no session read | invalid params ignored |
| `searchListings(filters, cursor?)` | server read, `lib/server/public-search.ts`, `'use cache'`, tag `listings`, `cacheLife("hours")` | normalized `SearchFilters` (below), cursor | `{ items: ListingCardDTO[] (with slug, pricePerSqft), total, nextCursor }` | public | none |
| `searchFacets(filters)` | server read, `'use cache'`, tag `listings` | normalized filters | `{ areas: { slug, nameEn, count }[], types: { type, count }[] }` | public | none |
| `loadMoreListingsAction(params, cursor)` | public server action, `app/properties/actions.ts` | the URL params object, cursor (string ≤ 200) | `{ items, nextCursor }` | public | invalid input returns the first page shape with `items: []` |
| `countListingsAction(params)` | public server action, same file | the URL params object | `{ total }` (from the cached search) | public | invalid input counts the default search |
| `filtersFromParams(params, refs)` / `paramsFromFilters(filters)` | pure, `lib/domain/search-params.ts` | URL params, area and amenity slug lists | normalized filters; canonical param string | n/a | n/a |
| `filtersSentence(filters, refs)` | pure, `lib/domain/search-params.ts` | normalized filters | the AC-11 sentence | n/a | n/a |

`SearchFilters` (normalized): `areaIds: string[]` (sorted), `propertyTypes` (sorted), `minPrice`, `maxPrice` (taka or null), `minBedrooms` (1 to 5 or null), `amenityIds` (sorted), `titleQuery` (string or null), `refCode` (string or null), `sort`. Normalizing (sorting arrays, dropping defaults) makes equal searches share one cache entry.

All three reads share one `buildWhere(filters)`, so results, the total (a separate `count` with the same where), and the facets can never disagree; the results, total, and both facet counts run concurrently.

Keyset paging per sort, cursor base64url JSON `{ s, k, id }` (`s` the sort, `k` the sort key: the `published_at` ISO time, or the price as a string because it is a `bigint`). A cursor whose `s` differs from the requested sort is ignored and the first page is returned. Spec 0002's existing newest cursor stays as it is for the assistant's callers:
- `newest`: `(published_at desc, id desc)` (spec 0002's existing cursor).
- `price-asc`: `(price_bdt asc, id asc)`; `price-desc`: `(price_bdt desc, id desc)`.
`searchPublishedListings` (spec 0002) gains `sort`, `titleQuery`, and `refCode`, keeping its existing behavior for the assistant's callers when they are absent.

**Rendering**: the page reads `searchParams`, so it is dynamic: the shell (heading, keyword box) renders at once and the results, counts, and chips render behind a `<Suspense>` boundary, calling the cached reads with normalized arguments. `view` is not part of any cache key. Searches with a title keyword use `cacheLife("minutes")` (free text can create many entries); others use `cacheLife("hours")`; all carry the `listings` tag, which spec 0005 refreshes with `updateTag` (read your own writes, so the next request is fresh).

**`filtersSentence` template**: "I'm looking for" + bedrooms ("a 3+ bedroom") + types joined with "or" (lowercase labels; "a home" when none, "a plot" style article for one type) + areas ("in Tilagor or Uposhohor"; "in Sylhet" when none) + price ("between BDT 50 lakh and 1.5 crore", "from BDT 50 lakh", "up to BDT 1.5 crore") + amenities ("with a lift, gas line" using amenity labels in lowercase) + keyword ("matching \"garden\"") + "."; cut to 500 characters.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Page | which homes | `listings.status = PUBLISHED` plus the normalized filters, through `buildWhere` |
| Page | area filter from slugs | `areas.slug` → `areas.id` (active areas only offered; an inactive area's slug is ignored) |
| Keyword | area match | trimmed, lowercased `q` equal to `areas.name_en`, `areas.name_bn`, or `areas.slug` |
| Keyword | code match | `parseListingCode(q)` (spec 0006 `chat-text.ts`) equal to `listings.ref_code` |
| Keyword | title match | `listings.title` contains `q`, case insensitive |
| Price presets | taka values | constants in `lib/domain/search-params.ts` (1 lakh = 100,000; 1 crore = 10,000,000) |
| Results | price, per sqft | `price_bdt` through `toTaka` and `formatPrice`; `pricePerSqft = round(price_bdt / built_up_sqft)` added to the card data, shown as "BDT 10,480 / sqft" through a new optional `PropertyCard` prop `pricePerSqft` |
| Results | total | `count` with the same `buildWhere` |
| Phone sheet | live count | `countListingsAction` on each change |
| Counts | area counts | `count` of PUBLISHED listings grouped by `area_id`, all filters except area |
| Counts | type counts | `count` grouped by `property_type`, all filters except type |
| Chips | labels | `areas.name_en`, `propertyTypeLabels`, `amenities.label`, preset labels ("50 lakh", "1.5 crore") |
| Paging | cursor | `{ s, k, id }`: the sort, the last item's sort key, its `id` |
| Assistant | sentence | `filtersSentence` from the normalized filters and labels |
| Metadata | titles, canonical | active area `name_en` (cached read of areas); `NEXT_PUBLIC_SITE_URL` |
| Amenity options | list | active `amenities` by `sort_order` |

**Key invariants**:
- Search shows PUBLISHED listings only, in every view, count, and page.
- The URL is the single source of truth for a search; two URLs with the same normalized filters show the same results.
- Paging never repeats or skips a home for a fixed set of listings (keyset on a unique tie breaker).
- Only the base page and single area pages are indexable.
- The page reads no session or cookies.

**Security model**:
- Public: reads published listing facts, areas, and amenities only. No personal data.
- `loadMoreListingsAction` is public: inputs validated with Zod (arrays capped at 20 values, strings at 80 or 200 characters), results come from the cached search, so repeated calls don't reach the database. Platform level rate limiting (Vercel) is the backstop; no app level limiter is added for a cached read.

**Configuration required**: none new.

**Critical test scenarios**:
- Happy path: `/properties?area=tilagor&type=apartment&min=5000000&beds=3` shows only matching PUBLISHED apartments with counts, chips, and the total, verifies **AC-1**, **AC-2**, **AC-4**, **AC-7**, **AC-9**.
- Keyword: "Tilagor" and "টিলাগড়" both add the area; "aur-1042" shows that listing only; "garden" matches titles containing it, verifies **AC-3**.
- Sorting and paging: 60 listings with duplicate prices, every sort, "Show more homes" until done: each home appears once, verifies **AC-5**, **AC-6**.
- Bad URL: `?beds=9&min=abc&sort=random` renders the default search without an error, verifies **AC-4**.
- Freshness: unpublish a listing; it's gone from results and counts on the next request, verifies **AC-14**.
- Empty: a search with no results shows the empty state and its two actions, verifies **AC-10**.
- Assistant: "Describe it instead" with filters opens the assistant with the sentence in the composer, verifies **AC-11**.
- Phone: the sheet's "Show N homes" count updates as choices change and applies them together, verifies **AC-8**.
- Indexing: `/properties?area=tilagor` is indexable with its canonical; `/properties?area=tilagor&beds=3` is `noindex` with canonical `/properties`, verifies **AC-13**.
- Accessibility: axe on the grid and list views and the open sheet; keyboard only filtering announces the count, verifies **AC-15**.

## Build plan

Tracer Bullet: first one real search end to end (URL to cached query to cards), then the controls, then counts, paging, and the edges.

1. [x] Thin thread: `lib/domain/search-params.ts` (parse, normalize, serialize), `searchListings` with the `listings` tag over an extended `searchPublishedListings` (sort and keyword), `/properties` rendering the first 24 cards with price per sqft and the total, the "Buy" link live, satisfies **AC-1**, **AC-3**, **AC-4**, **AC-14**, **AC-16**
2. [x] Controls: the desktop filter panel (areas, price presets, types, bedrooms, amenities) with instant URL updates, the keyword box, sort, view toggle, active chips, satisfies **AC-2**, **AC-5**, **AC-9**, **AC-12**
3. [x] Counts and the phone sheet: `searchFacets`, dimmed zero options, the bottom sheet with `countListingsAction` behind its live "Show N homes", satisfies **AC-7**, **AC-8**
4. [x] Paging: the price sort index migration, the sort tagged keyset cursors, `loadMoreListingsAction`, "Show more homes" with its failure message and focus move, satisfies **AC-5**, **AC-6**, **AC-15**
5. [x] Edges: empty and error states (`error.tsx`), the assistant sentence and nudge card, metadata and indexing rules, accessibility pass, satisfies **AC-10**, **AC-11**, **AC-13**, **AC-15**

## Consequences

**Positive**:
- Every published home is browsable, shareable, and reachable from search engines through meaningful landing pages.
- Discovery feeds the assistant (with the buyer's filters) instead of competing with it.
- No new services; spec 0005's tag keeps results honest.

**Negative / tradeoffs**:
- Each filter change is a server round trip; on slow connections filtering feels slower than an in browser filter.
- Keyword search misses words that appear only in descriptions or addresses.
- Price presets can't express an exact budget like 1.35 crore; the nearest preset applies.
- Counts add two grouped queries and a total per uncached search.
- Many filter combinations mean many cache entries; acceptable at this inventory size.

**Neutral**:
- Spec 0002's `searchPublishedListings` gains `sort`, `titleQuery`, and `refCode`, and one index.
- Spec 0003's `PropertyCard` shows price per sqft (an optional prop), shared with spec 0009's similar homes.
- Feature 13 adds a map view to the same view toggle (`view=map`).

## Follow-up

- [ ] Spec 0009: once this ships, the property page breadcrumb's type and area become links to `/properties?type=<type>` and `/properties?area=<slug>`.
- [ ] Spec 0002: record the new `searchPublishedListings` options and the `search_price_sort` index.
- [ ] Feature 13 (map view): add `view=map` to this toggle.
- [ ] Feature 16 (SEO baseline): add `/properties` and the active area pages to the sitemap.
- [ ] Feature 25 (paid featured): decide whether a "Recommended" sort with featured homes first replaces newest as the default.
- [ ] Revisit full text search over descriptions if keyword searches often return nothing.
