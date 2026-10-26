# Verify: Homepage · spec 0011 · updated 2026-10-26
_Steps derived from spec 0011 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. The spec is `Assumed`: `/architect` may change these when it ratifies._

## UI / manual
- [ ] Open `/` signed out → the hero shows the newest published listing's cover, and the "Newest on Aurevia" card names that listing with its real price → AC-1
- [ ] "Selected this season" shows the 6 newest published homes, newest first; "View all homes" opens `/properties` → AC-1
- [ ] Unpublish the newest listing as an agent, reload `/` → it's gone from the hero and the list → AC-1, AC-5
- [ ] Each category tile shows a real type, a count, and a "from" price that match `/properties?type=<type>`; clicking it opens that filtered page → AC-1, AC-4
- [ ] Stats: Verified homes, Neighbourhoods, and Homes from match the published listings in the database → AC-4
- [ ] No testimonials section, and no sold totals, ratings, legal partner, or approval claims anywhere on the page → AC-4
- [ ] Search panel: pick an area, a type, a max budget, and 3+ bedrooms, press Search → `/properties` opens with `area`, `type`, `max`, and `beds` in the URL and matching results → AC-3
- [ ] Type in the describe box and press Ask while signed out → sign in, then the assistant opens with that text in the box → AC-2
- [ ] Click each suggestion chip, including the Bangla one → the assistant opens with that text (the Bangla chip shows in the Bangla font) → AC-2
- [ ] "Ask about this home" on a card, the hero card, and the example card each open the assistant with that home → AC-1
- [ ] With no published listings (unpublish them on a test branch) → the hero shows the plum panel with no card; newest, categories, example card, and stats are hidden; nothing errors → AC-1
- [ ] At 390px wide → no sideways scroll; hero, search panel, and promo stack cleanly → AC-6
- [ ] Switch to dark → hero and promo text stay light on the photo and the plum band; the advisor box stays readable → AC-6
- [ ] Keyboard only: Tab reaches every link, select, and button in order with a visible focus ring; axe finds no violations in light and dark → AC-6

## Commands
- [ ] `npm run typecheck` and `npm run lint` → clean
- [ ] `npm run build` → `/` builds as partial prerender with the 1 hour listings cache (no cookie read) → AC-5
- [ ] `/styleguide` shows the new `feature`, `media-scrim`, and `rose-200` swatches → AC-6

## Acceptance-criteria coverage
- AC-1: hero listing, newest six, tiles, card links, no listings state
- AC-2: describe box through sign in, chips
- AC-3: search panel to `/properties`
- AC-4: stats and tiles from the database, no invented content
- AC-5: unpublish shows on reload, build output
- AC-6: phone width, dark mode, keyboard and axe, styleguide tokens
