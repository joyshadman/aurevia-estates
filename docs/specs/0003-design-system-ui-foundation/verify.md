# Verify: Design system & UI foundation · spec 0003 · updated 2026-10-18
_Steps derived from spec 0003 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Commands
- [ ] `npm run test:e2e` → all checks in `tests/e2e/design-system.spec.ts` pass → AC-2, AC-3, AC-4, AC-9, AC-10, AC-11, AC-12, AC-16
- [ ] `npm run lint` → clean → AC-1, AC-10
- [ ] Lint probe: add `"bg-[#853953]"`, `` `rgba(0,0,0,0.1)` ``, or `"bg-brand-plum-600"` to any file in `components/` → `no-restricted-syntax` error → AC-1
- [ ] `npm run build` → `/` listed as Partial Prerender (◐), not fully dynamic → AC-6
- [ ] Production build without `ENABLE_STYLEGUIDE`, then `next start` → `GET /styleguide` is 404; build with `ENABLE_STYLEGUIDE=true` → 200 → AC-8

## UI / manual
- [ ] Open `/styleguide`, set the theme to Dark, reload with JavaScript throttled → first paint is dark, no flash → AC-3
- [ ] Theme set to System, flip the OS color scheme → page follows without reload → AC-3
- [ ] Change the theme in one tab → a second open tab follows → AC-4
- [ ] The Bangla line on `/styleguide` renders in Hind Siliguri (check computed font) → AC-7
- [ ] Every component and state from the spec's inventory is on `/styleguide` in both themes → AC-8
- [ ] Tab through `/styleguide`: visible focus ring on every control; open the dialog, Tab never reaches the page behind, backdrop click closes it, focus returns → AC-9
- [ ] With OS reduced motion on, cards don't lift and skeletons don't pulse → AC-11
- [ ] Header shows the wordmark, AI Assistant, the theme toggle, and Sign in; below the `lg` width the links move into the drawer; no language toggle → AC-13
- [ ] Unsplash photos on `/styleguide` load through `/_next/image` → AC-14
- [ ] `design.md` covers tokens (both themes) with contrast, type, spacing, radii, shadows, motion, components, and accessibility rules → AC-15

## Value sourcing checks
- [ ] Inline script: `localStorage["aurevia-theme"]` set to `dark`, `light`, `system`, garbage, and with storage blocked → applied theme is dark, light, follows device, follows device, follows device
- [ ] PriceTag: `formatPrice(12500000)` → `BDT 12,500,000`; a negative value throws
- [ ] SpecChips: a plot shows only katha (`5.5 katha`); an apartment with null baths hides the bath chip; `1 bed` vs `3 beds`
- [ ] ListingImage: a host outside `lib/images.ts` renders unoptimized (no `/_next/image`)
- [ ] SiteHeader links: only `lib/nav.ts` entries with `live: true` and placement `header`

## Pending (not built yet)
- AC-5 account theme sync, the signed in AccountMenu and ThemeSync: need the database and sign in (feature 5).
- `toCardDTO`: needs `serializeListing` from the data model (feature 3).

## Acceptance-criteria coverage
- AC-1 lint probe · AC-2 axe · AC-3 e2e + manual · AC-4 e2e + manual · AC-5 pending · AC-6 build output · AC-7 manual · AC-8 build guard + manual · AC-9 e2e + manual · AC-10 axe + lint · AC-11 e2e + manual · AC-12 e2e + value checks · AC-13 manual · AC-14 manual · AC-15 manual · AC-16 e2e
