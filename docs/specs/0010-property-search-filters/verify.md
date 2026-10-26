# Verify: Property search & filters · spec 0010 · updated 2026-10-26
_Steps derived from spec 0010 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. The spec is `Assumed`: `/architect` may change these when it ratifies._

## UI / manual
- [ ] Open `/properties` signed out → published homes only, newest first, "N homes for sale", "Showing 1 to N of N" → AC-1
- [ ] Unpublish a listing as an agent, reload → it's gone on the next load; publish it again → it's back → AC-7
- [ ] With more than 12 published homes → page 1 shows 12, numbered pages and Next appear, `?page=2` shows the rest → AC-1
- [ ] Tick two areas and press Show homes → only homes in either area; the URL has `area=<slug>` twice; chips show both → AC-2, AC-3
- [ ] Pick min 1.5 crore, max 3 crore → only prices in that range; chip reads "BDT 1.5 crore to BDT 3 crore" → AC-2
- [ ] Beds 3+ → only homes with 3 or more bedrooms; plots drop out → AC-2
- [ ] Tick Villa and House → either type → AC-2
- [ ] Tick two amenities → only homes with both → AC-2
- [ ] Search `tilagor`, `villa`, and `aur 1001` in the top box → area, title, and ref code matches; other filters stay → AC-2
- [ ] Remove one chip → only that filter drops; Clear all and Reset drop every filter but keep sort and view → AC-3
- [ ] Copy a filtered URL into a new window → the same results, form, and chips → AC-3
- [ ] Open `/properties?area=nope&sort=bad&view=map&page=abc&beds=9` → the plain first page, "for sale", no chips, no error → AC-3
- [ ] Open `/properties?min=30000000&max=15000000` → treated as 1.5 to 3 crore → AC-3
- [ ] Change Sort to each option → prices order low to high, then high to low; Newest first matches publish order; the URL updates → AC-4
- [ ] Switch to list view and back → cards change layout; `view=list` in the URL; filters stay → AC-5
- [ ] Filter to nothing → "No homes match" with Clear filters and Describe it to the assistant → AC-6
- [ ] Open `?page=99` → "This page is empty" with Back to page 1 → AC-6
- [ ] Throttle the network → skeletons show while results load → AC-6
- [ ] Stop the database and reload → "We couldn't load homes right now" with Try again → AC-6
- [ ] At 390px wide → the filter panel is folded behind "Filters (n)", opens and closes; no sideways scroll → AC-2
- [ ] "Ask about this home" on a card → `/assistant?listing=<slug>`, which signs in first, then opens the chat with that home → AC-1
- [ ] Header and footer show "Buy" linking to `/properties` → AC-1
- [ ] Keyboard only: Tab reaches search, every filter, Show homes, sort, view, chips, cards' buttons, and pages, with a visible focus ring; axe finds no violations in light and dark → AC-6

## Commands
- [ ] `npm run typecheck` and `npm run lint` → clean
- [ ] `npm run build` → `/properties` builds as partial prerender (no cookie read on the page) → AC-7

## Acceptance-criteria coverage
- AC-1: published only, count, paging, newest default, nav, card button
- AC-2: area, price, beds, type, amenity, keyword, mobile panel
- AC-3: URL round trip, chips, invalid params, swapped prices
- AC-4: each sort
- AC-5: grid and list
- AC-6: empty, past end, loading, error, keyboard and axe
- AC-7: publish and unpublish show on next load, build output
