# Verify: Map view · spec 0013 · updated 2026-10-26
_Steps derived from spec 0013 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. The spec is `Assumed`._

## UI / manual
- [ ] Click "Explore map" in the header → `/properties?view=map` shows a price pin for every published home → AC-1
- [ ] Add filters (an area, 3+ beds) → only matching pins remain, and the URL keeps the filters and `view=map` → AC-1
- [ ] Click a pin → a popup with the cover, title, area, and price; click it → the listing page opens → AC-2
- [ ] Below the map, the same homes are listed as links with prices → AC-1
- [ ] Switch between grid, list, and map → filters stay; map shows no paging → AC-1
- [ ] Filters that match nothing → the "No homes match" state, not an empty map → AC-1
- [ ] A property page → "Around the address" shows a map centred on the home with its pin, plus "Open in Google Maps" → AC-3
- [ ] The map's corner shows "© OpenStreetMap contributors"; no API key is set anywhere → AC-4
- [ ] Keyboard: Tab reaches the zoom buttons and each pin; a focused pin shows the focus ring on its price pill; Enter opens its popup → AC-5
- [ ] At 390px wide → the map fits with no sideways scroll; the page still scrolls past it → AC-5
- [ ] Dark mode → pins, popups, zoom buttons, and attribution use dark tokens (tiles stay light by design) → AC-5
- [ ] Nearby places: not shown, by design (spec 0013 leaves the source open) → open item for `/architect`

## Commands
- [ ] `npm run build` → `/properties` and `/properties/[slug]` build with the map loaded only in the browser

## Acceptance-criteria coverage
- AC-1: pins for all matches, filters kept, list below, empty state
- AC-2: popup link
- AC-3: property page map
- AC-4: attribution, no key
- AC-5: keyboard focus, phone width, dark mode
