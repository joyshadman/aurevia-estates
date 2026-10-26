# Verify: Property details page · spec 0012 · updated 2026-10-26
_Steps derived from spec 0012 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. The spec is `Assumed`: `/architect` may change these when it ratifies._

## UI / manual
- [ ] Click a card on `/properties` and on the homepage → it opens `/properties/<slug>` for that home; the homepage hero card does too → AC-6
- [ ] On a home's page → breadcrumb, type and ref badges, title, address (the area named once), price, price per sqft when it has built up sqft, gallery, key facts, about, amenities, specifications, "Around the address", advisor card, similar homes → AC-2
- [ ] Specifications show only fields the listing stores; clear one (for example parking) as an agent and reload → that row is gone → AC-2, AC-5
- [ ] Gallery: Next and Previous move through every photo and wrap; the count reads "2 of 3"; clicking a thumbnail shows it; a listing with one photo shows no arrows → AC-2
- [ ] "Open in Google Maps" opens a new tab at the listing's coordinates → AC-2
- [ ] Advisor card names the assigned agent when their name is public, else "an Aurevia advisor" → AC-2
- [ ] "Chat about this home" while signed out → sign in, then the chat opens with this home in context → AC-3
- [ ] "You may also consider" shows up to 3 other published homes of the same type or area, closest in price first, never this home → AC-2
- [ ] Share: on a phone it opens the share sheet; on desktop it copies the link and says "Link copied" → AC-2
- [ ] Unpublish the home as an agent, reload its page → "This home isn't listed right now", with `<meta name="robots" content="noindex">` in the page; publish it again → back → AC-1, AC-5
- [ ] Open `/properties/no-such-home` → the same not found page with `noindex` (status 200 by design, see spec 0012) → AC-1
- [ ] Edit the title or price as an agent → the page shows the change on the next load → AC-5
- [ ] View source → a unique `<title>`, meta description, canonical URL on `NEXT_PUBLIC_SITE_URL`, `og:title`, `og:image` (the cover), and `twitter:card` `summary_large_image` → AC-4
- [ ] Paste the page URL into a social card preview tool on a deployed build → the cover photo and title show → AC-4
- [ ] At 390px wide → no sideways scroll; gallery, facts, and the advisor card stack → AC-7
- [ ] Dark mode → the photo count and arrows stay readable; badges and specs use the dark tokens → AC-7
- [ ] Keyboard only: Tab reaches breadcrumb, Share, gallery arrows, thumbnails, maps link, chat button, and similar cards with a visible focus ring; axe finds no violations in light and dark → AC-7

## Commands
- [ ] `npm run typecheck` and `npm run lint` → clean
- [ ] `npm run build` → each published slug prerenders under `/properties/[slug]` with the 1 hour cache, and no "encountered URL data" error → AC-5

## Acceptance-criteria coverage
- AC-1: unpublished and unknown slugs show the noindex not found page
- AC-2: every section, stored fields only, gallery, maps, advisor, similar, share
- AC-3: chat about this home through sign in
- AC-4: title, description, canonical, Open Graph, Twitter
- AC-5: edits and unpublish show on next load, build output
- AC-6: card and hero links
- AC-7: phone width, dark mode, keyboard and axe
