# Verify: property details page · spec 0009 · updated 2026-10-19
_Steps derived from spec 0009 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

To run them before the Neon move, serve a build against the local test database (seeded with sample listings by `npm run test:db`): `NEXT_PUBLIC_SITE_URL=http://localhost:3212 DATABASE_URL=postgresql://postgres:shadow@127.0.0.1:54329/aurevia_test npm run build && npx next start -p 3212` with the same variables.

## Commands
- [ ] `npm run test:db` → `tests/db/public-listings.test.ts` passes → AC-1, AC-3, AC-4, AC-5, AC-6, AC-10
- [ ] `npm run build` → `/properties/[slug]` is a partial prerender; the image routes build → AC-7, AC-8

## UI / manual
- [ ] Open `/properties/the-malnicherra-residence-aur-1001` → breadcrumb, type and code, title, address (area not repeated), price, per sqft, gallery, facts, description paragraphs, amenities, specifications, location link, advisor, similar homes when any exist → AC-1, AC-5, AC-13, AC-14
- [ ] Click a gallery photo → full screen viewer; arrows, swipe, Escape; focus returns to the photo; "View all N photos" with more than 5 photos → AC-4
- [ ] "Book a viewing" signed out → sign in → assistant greets with the home and the composer says "I'd like to book a viewing of AUR-1001" → AC-2
- [ ] Phone width → the two actions sit in a bar at the bottom → AC-2
- [ ] Mark a listing sold → Sold badge, "This home has sold" with "Find similar homes", no chat actions, `noindex` → AC-3
- [ ] Unpublish a listing → its page shows "We couldn't find that page" with `noindex` (status 200, accepted) → AC-3, AC-7
- [ ] Change a published listing's price in the editor → the page and the share card show it on the next request → AC-7, AC-8
- [ ] View source → title "<title> in <area>", description up to 160 characters, canonical from `NEXT_PUBLIC_SITE_URL`, `og:image` pointing at a JPEG under 300 KB → AC-8
- [ ] Share on a phone opens the share sheet; on a desktop it copies the link and toasts → AC-9
- [ ] As an agent, "Preview page" in the editor shows a draft with "Price not set" and the preview banner; signed out, the preview goes to sign in → AC-10
- [ ] Chat result cards open the property page → AC-11
- [ ] Axe on a published and a sold page: no serious issues → AC-12
- [ ] A public agent with WhatsApp shows the button with the prefilled message; a private one shows "An Aurevia advisor" → AC-6

## Value sourcing checks
- [ ] Price per sqft is price divided by built up sqft, whole taka; hidden for plots
- [ ] Photos: the cover first even when another photo has a lower sort order; empty alt reads "<title>, photo N"
- [ ] Similar homes: same area before nearby areas before the rest; nothing over 25% away in price; never sold homes
- [ ] An agent renaming themselves updates advisor cards on the next request
