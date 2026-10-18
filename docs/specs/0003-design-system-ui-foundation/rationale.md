# 0003. Design system and UI foundation: rationale

The decision record behind [index.md](index.md). `/develop` does not need this file.

## Context

Aurevia Estates has a finished visual direction in static HTML mockups (`desing-check/aurevia-estates/`): a Tailwind 3 Play CDN theme with brand colors (canvas, burgundy, plum, charcoal), three fonts (Playfair Display, Inter, Hind Siliguri), two shadows, pill buttons, and `rounded-2xl` cards. The real app is a create next app starter on Next.js 16 and Tailwind v4 (spec 0001). Every slice 1 feature (sign in, listing form, chat, booking, lead inbox) needs the same controls, so without a shared foundation each feature copies mockup classes and drifts.

Forces that shaped the choice:
- **Two themes at launch.** The engineer wants light and dark from day one, which rules out naming colors after the brand inside components.
- **Caching.** Spec 0001 requires public pages never to read cookies, so they stay cached for SEO. Yet the engineer wants the theme saved to the account, which normally needs a server read.
- **Accessibility.** The scope's done line requires WCAG AA on base components. The site serves families abroad and local buyers, on phones, often on slow connections.
- **Bangla.** The chat runs in English or Bangla now; the whole site may follow later. Bangla script needs its own font.
- **Small team, no component library yet.** Whatever is chosen has to be maintainable by one or two people.
- **The mockup's muted gray fails contrast.** `#8A8A8A` on canvas measures 3.13:1, below the 4.5:1 AA needs for body text.

## Options considered

### Option 1: Role tokens, hand written kit on native primitives (chosen)
Two layer tokens in Tailwind v4 `@theme`, components written in house with `cva`, overlays on `<dialog>` and the Popover API.
**Pros**: no UI dependency; dark mode is a token swap; native primitives give focus trapping and Escape handling for free.
**Cons**: more code to own; complex widgets (combobox, date picker) are built by hand later.

### Option 2: shadcn/ui on Radix
Copy in shadcn components and restyle them with the tokens.
**Pros**: fastest path to a large, accessible kit; popular, well documented.
**Cons**: brings Radix as a dependency tree; the copied code is still owned and must be restyled; the engineer chose hand written.

### Option 3: Brand named tokens with `dark:` variants
Keep `bg-burgundy` and add a `dark:` pair to every class.
**Pros**: matches the mockups one to one; no indirection.
**Cons**: every component carries two color sets; a palette change touches every file; easy to forget the dark half.

### Option 4: Theme read from the session on the server
Render `data-theme` from `profiles.theme_preference` in the root layout.
**Pros**: one source of truth; no client script.
**Cons**: makes every page dynamic, against spec 0001's caching rule; signed out visitors still need a client mechanism.

## Rationale

Role tokens are what make two themes at launch affordable: components are written once, and the dark palette lives in one file. The derived dark palette keeps the brand (plum charcoal surfaces, lighter burgundy and plum accents) and every pair was measured, not estimated, so AC-2 is a check, not a hope.

The engineer chose hand written components over shadcn/ui. That is workable here because the riskiest accessibility work (focus traps, Escape, top layer stacking) is now native in every current browser through `<dialog>` and the Popover API. The cost is real for later widgets, so feature 8's time picker should budget for it.

Saving the theme to the account conflicts with spec 0001's caching rule if done on the server. Mirroring it into local storage and applying it with an inline script keeps pages cached and flash free; the only server read sits in the account slot, which already has to be dynamic to show who is signed in. When they disagree the account wins, because it is the user's most deliberate choice and the one that should follow them across devices.

The engineer chose Google Fonts by link tag over self hosting with `next/font`, which would remove the third party request. It works, but it means a privacy disclosure, CSP entries, and slightly slower first text; this is recorded as a follow up rather than overridden. Likewise international price grouping was the engineer's call over lakh and crore; it is isolated in `formatPrice`, so changing it later costs one function.

Lucide matches the mockup's thin outline icons. `cva` plus `tailwind-merge` gives typed variants and safe overrides at a few kilobytes. `/styleguide` with axe gives a single place to check every state in both themes without adding Storybook.

## Evidence: mockup survey

- Tailwind theme: `desing-check/aurevia-estates/assets/js/tailwind.config.js` (colors, three font families, `soft` and `lift` shadows, `eyebrow` letter spacing).
- Most used shapes in `index.html`: `rounded-full` (controls), `rounded-2xl` (cards), one `rounded-[28px]` hero frame; container `max-w-7xl` on every page.
- Icons: inline outline SVGs, mostly `stroke-width="1.5"`.
- No dark mode classes; the assistant page marks Bangla text with `lang="bn"`.
- Photos: `images.unsplash.com` on every page, with a script that hides a failed image and keeps the tinted frame.
- Header links: Buy, Rent, Sell, Explore, AI Assistant, Contact, Agent login, Book a consultation. Rent is not in the data model (`deal_type` is SALE only), so it stays not live.
