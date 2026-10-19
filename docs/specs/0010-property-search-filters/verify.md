# Verify: property search and filters · spec 0010 · updated 2026-10-19
_Steps derived from spec 0010 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Before the Neon move, serve a build against the local test database as in spec 0009's `verify.md`.

## Commands
- [ ] `npm run test:db` → `tests/db/public-search.test.ts` passes → AC-1 to AC-7, AC-14
- [ ] `npm run db:drift` with `SHADOW_DATABASE_URL` → no difference (the `search_price_sort` index) → AC-5

## UI / manual
- [ ] Header "Buy" opens `/properties`: PUBLISHED homes only, 24 cards, "N homes match", price per sqft on cards → AC-1, AC-16
- [ ] Tick areas and types, pick a price range and 3+ beds, tick amenities → URL and results update at once, chips appear, counts beside areas and types change → AC-2, AC-7, AC-9
- [ ] Type "Tilagor", then "টিলাগড়", then an AUR code, then a title word → area filter, area filter, one home, title matches; a lone "%" matches nothing → AC-3
- [ ] Copy the URL into a new tab → the same search and view; `?beds=9&min=abc&sort=random` → the default search, no error → AC-4
- [ ] Each sort, then "Show more homes" until it disappears → no home twice; focus lands on the first new card → AC-5, AC-6, AC-15
- [ ] Phone width: "Filters (N)" opens the sheet; "Show N homes" updates live; Reset clears → AC-8
- [ ] A search with no results → empty state with "Clear filters" and "Describe it to the assistant" → AC-10
- [ ] "Describe it instead" → the assistant composer holds the sentence from the filters → AC-11
- [ ] Grid and list toggle, kept in the URL → AC-12
- [ ] View source: `/properties` and `/properties?area=tilagor` have their own canonical and no noindex; `/properties?area=tilagor&beds=3` is `noindex, follow` with canonical `/properties` → AC-13
- [ ] Unpublish a listing → gone from results and counts on the next request → AC-14
- [ ] Axe on grid, list, and the open sheet; keyboard only filtering announces the count → AC-15

## Value sourcing checks
- [ ] Price presets map to whole taka (1 lakh = 100,000; 1 crore = 10,000,000)
- [ ] Area counts ignore the area filter; type counts ignore the type filter
- [ ] The "Show N homes" count equals the results total after applying
