# Verify: homepage · spec 0012 (assumed) · updated 2026-10-19
_Steps derived from the scope's Done when and spec 0012's assumption. `/check verify` runs these; `/test` locks the durable ones._

## Commands
- [ ] `npm run test:db` → `tests/db/home.test.ts` passes
- [ ] `npm run build` → `/` is a partial prerender and the build needs no database

## UI / manual
- [ ] `/` shows the hero copy, a "Featured this month" card for the newest published home, the quick search, three newest homes with "View all N homes", type tiles with counts and starting prices, the assistant promo, and Why Aurevia → Done when
- [ ] Publish a new listing → it becomes the featured card and the first card on the next request; mark it sold → it disappears → Done when
- [ ] Quick search with Tilagor, Apartment, 1.5 crore, 3+ → `/properties?area=tilagor&type=apartment&max=15000000&beds=3`
- [ ] Type in the describe box, press "Ask the assistant" signed out → sign in → the assistant composer holds the text, not sent → Done when
- [ ] Example chips fill the box; the Bangla one is marked `lang="bn"`
- [ ] With no published listings, only the copy sections show, without errors
- [ ] Axe passes on `/` in both themes; the small text on type tiles reads clearly
- [ ] No statistics or testimonials appear until the agency supplies real ones
