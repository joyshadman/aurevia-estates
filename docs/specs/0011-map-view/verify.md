# Verify: map view · spec 0011 · updated 2026-10-19
_Steps derived from the scope's Done when and spec 0011's acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Setup
- A MapTiler Cloud key in `NEXT_PUBLIC_MAPTILER_KEY` (restricted to localhost for local runs), and the sample seed (`npm run db:seed -- --sample`; AUR-1002 has nearby places)

## Commands
- [ ] `npm run test:db` → `tests/db/maps.test.ts` passes (short price, map points by status, URLs, nearby places save, order, limits, stale save, facts)
- [ ] `npm run build` → grid and list views and property pages ship no MapLibre chunk until a map is shown
- [ ] `npm run eval:assistant` → passes, including `nearby-listed` (needs `OPENROUTER_API_KEY`) → AC-7

## UI / manual
- [ ] `/properties?view=map`: every match as price pins ("৳ 4.8 Cr"), clusters with counts that split on zoom and zoom in when selected → Done when, AC-1
- [ ] Select a pin → a card with the cover, price, title, area, and chips linking to the page; Escape, the map, or a cluster closes it → Done when, AC-2
- [ ] Change filters → the map reframes; no matches → Sylhet with "No homes match these filters"; with reduced motion the camera jumps → AC-3
- [ ] The first Tab reaches "Skip the map, show as a list", which opens the List view with the same filters; the canvas is named "Map of N homes matching your search" → AC-10
- [ ] With over 500 matches, "Showing the newest 500 of N" shows → AC-1
- [ ] A property page shows the static map with a burgundy pin and alt text; "Show interactive map" loads the live map; the network shows no MapLibre before that → Done when, AC-4, AC-8
- [ ] AUR-1002's page lists "Around the address" in the agent's order with icons and "6 min walk" → Done when, AC-5
- [ ] In the editor, add three places, reorder, save → the page shows the new order on the next request; a 9th can't be added; a stale tab's save is refused → AC-6, AC-11
- [ ] Ask the assistant "What's near the Tilagor Hillside Villa?" → it names only the listed places; ask about a hospital → an advisor → AC-7
- [ ] Unset the key → property pages keep the address, places, and Google Maps link with no broken image; the Map view says "The map isn't available right now" with a link to the grid → AC-9
- [ ] A key restricted to another domain → the same fallbacks → AC-9
- [ ] Axe passes on the Map view and a property page; the map style matches the site's muted palette → AC-10, AC-12
- [ ] Launch: create the MapTiler account, restrict the production key to the real domains, set a usage alert
