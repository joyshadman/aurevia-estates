# 0003. Design system and UI foundation

**Date**: 2026-10-17
**Status**: In Progress

## Summary

This spec turns the HTML mockups into the shared look every page uses: color tokens for a light and a dark theme, fonts, spacing, and a kit of hand written, accessible base components. Components only ever use role tokens (like "surface" or "accent"), so switching themes just swaps values. A visitor picks light, dark, or system from the header; signed in users have the choice saved to their account and mirrored in the browser, so public pages stay cached and never flash the wrong theme. Everything is written down in a root `design.md` and shown on a dev only `/styleguide` page that axe checks for WCAG 2.2 AA in both themes.

## Requirements

**User stories**:
- As a visitor, I want the site to match my device's light or dark setting, and to override it, so it is comfortable to read.
- As a signed in visitor or agent, I want my theme choice to follow me to other devices.
- As a visitor who uses a keyboard or screen reader, I want every control reachable, visible when focused, and announced correctly.
- As a Bangla reader, I want Bangla text in a font made for Bangla script.
- As the builder of later features, I want ready components and one written source of truth, so pages look the same without copying classes.

**Acceptance criteria**:
- **AC-1**: `app/globals.css` holds the tokens (see *Tokens*): the brand ramp as plain `:root` variables outside `@theme` (so no `bg-brand-*` utility exists), Tailwind's default palette switched off (`--color-*: initial`), the role tokens with light values in `@theme`, and dark overrides of the same `--color-*` variables under `:root[data-theme="dark"]`. Components and pages use only role utilities. The lint rule under *Enforcement* finds no hex color, `rgb(`/`hsl(`, or `brand-` reference in any string or template literal under `components/` and `app/`, outside the listed exceptions.
- **AC-2**: Every pair in the *Contrast table* meets WCAG 2.2 AA in both themes: at least 4.5:1 for text, at least 3:1 for control borders, focus rings, and meaningful icons.
- **AC-3**: The theme is applied before first paint with no flash. The server renders `<html data-theme="light" data-theme-pref="light" suppressHydrationWarning>`; an inline script in `<head>` reads `localStorage["aurevia-theme"]` inside `try/catch` (missing, invalid, or unreadable means `light`, amended by [spec 0024](../0024-light-theme-default.md)), resolves `system` with `matchMedia`, and sets `data-theme`, `data-theme-pref`, and `style.colorScheme`. With `system`, the page follows live changes of the device setting. This works signed out and survives a reload.
- **AC-4**: The theme toggle (header and mobile menu) offers Light, Dark, and System, shows the current choice (icon chosen by CSS from `data-theme-pref`, so server and client markup match), and applies it at once without a reload. A change in one tab applies in the other open tabs. It is operable by keyboard and screen reader.
- **AC-5**: `profiles.theme_preference` is null until the user first chooses. Every toggle change calls `setThemePreference` (a signed out "unauthenticated" result is ignored). On a page load for a signed in user, `ThemeSync` reconciles once: if a save is pending in the browser, it retries it first and keeps the local value; else if the account value is null, it saves the local value to the account only when the browser holds a value the user picked (never the light default; [spec 0024](../0024-light-theme-default.md), AC-4); else if the browser holds none or they differ, the account value wins, is written to local storage, and is applied without a reload. A failed save keeps the local choice applied, sets the pending flag, and never blocks the UI or shows an error.
- **AC-6**: Public pages stay cacheable. The header shell is static; `AccountSlot` is the only part that reads the session, through the read only `getSessionUser()` (no profile insert), rendered behind `<Suspense>` with a skeleton. `next build` reports the homepage as static or partially prerendered, not fully dynamic.
- **AC-7**: Playfair Display (display), Inter (body), and Hind Siliguri (Bangla) load from Google Fonts with `display=swap` and a `preconnect`. Any element with `lang="bn"`, or inside one, renders in Hind Siliguri through a `:lang(bn)` rule.
- **AC-8**: Every component in *Component inventory* exists with its listed variants and states and renders on `/styleguide` in both themes. `/styleguide` returns 404 when `NODE_ENV` is `production`, unless `ENABLE_STYLEGUIDE=true` (set only in CI).
- **AC-9**: Keyboard and focus. Every interactive component is reachable with Tab in visual order and shows the focus ring (`outline: 2px solid var(--color-focus)`, offset 2px) on `:focus-visible`. `Dialog` (native `<dialog>`, `showModal()`): focus moves inside on open and never reaches content behind it; it closes on Escape, the close button, and a click on the backdrop; the page behind does not scroll; focus returns to the trigger on close. `Menu` (Popover API, opened with `popovertarget`): arrow keys move between items, Escape closes and returns focus to the trigger, an outside click closes it. The mobile menu is fully usable by keyboard.
- **AC-10**: axe reports zero serious or critical violations on `/styleguide` in light and in dark (excluding the Next.js dev overlay element `nextjs-portal`), and the `eslint-plugin-jsx-a11y` strict rules pass.
- **AC-11**: Motion: transitions last 200ms or less, using the `duration-fast` and `duration-base` tokens. Under `prefers-reduced-motion: reduce`, all transitions and animations are off, including the skeleton shimmer and the card lift.
- **AC-12**: `PropertyCard` renders a `ListingCardDTO` in `grid` and `list` layouts: cover photo, title, area, price (with a "Negotiable" badge when set), and the spec chips in the *Spec chips* table. The price shows as `BDT 12,500,000`. The title is the card's one link, stretched over the card; the heart is a sibling button, not inside the link, and is not rendered when no `onToggle` is passed. A listing with no photo, or a photo that fails to load, shows the tinted frame with a house icon. A photo from a host outside `images.remotePatterns` renders `unoptimized` instead of throwing.
- **AC-13**: The header renders only the entries marked `live` in `lib/nav.ts` (see *Navigation*). With slice 1 live it shows the wordmark (home link), AI Assistant, the theme toggle, and the account slot (Sign in, or the account menu), and no language toggle. Below the `lg` breakpoint the links move into the mobile menu.
- **AC-14**: Photos from `images.unsplash.com` and avatars from `lh3.googleusercontent.com` render through `next/image` (both in `images.remotePatterns`), and `next build` passes.
- **AC-15**: Root `design.md` documents both themes' tokens with the contrast table, the type scale, spacing, radii, shadows, motion, every component with its variants and when to use it, and the accessibility rules in *Standard definition*.
- **AC-16**: Calling `toast()` from any client component shows a toast in the single `<Toaster/>` mounted in the root layout. Toasts stay visible and dismissible while a Dialog is open.

## Decision

**Chosen option**: Option 1: Tailwind v4 role tokens over a brand ramp, hand written components on native browser primitives, light and dark at launch with an account mirrored theme.

Build one token layer in `app/globals.css`, a hand written component kit in `components/ui/` (base), `components/chrome/` (header, footer, theme), and `components/listing/` (real estate pieces), styled with `cva` and a configured `cn()` helper, using native `<dialog>` and the Popover API for overlays and Lucide for icons, documented in root `design.md` and checked on `/styleguide`.

**Implementation skills**: `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`) · `supabase` (`supabase/agent-skills`, `.claude/skills/supabase/`) for the session read in `getSessionUser()` · `prisma-client-api` (`prisma/skills`, `.claude/skills/prisma-client-api/`) for the preference read and update

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

### Tokens

Two layers. The **brand ramp** holds raw colors as plain `:root` variables (outside `@theme`, so Tailwind generates no utility for them) and is used only inside `globals.css`. **Role tokens** live in `@theme` as `--color-<role>` with light values, and `:root[data-theme="dark"]` overrides the same variables. `@theme` starts with `--color-*: initial;` so Tailwind's default palette (`bg-gray-500`, `bg-white`) does not exist. Components may use only role utilities.

**Brand ramp**: `--brand-canvas #F3F4F4` · `--brand-burgundy-700 #6E2E44` · `--brand-burgundy-600 #853953` · `--brand-burgundy-100 #F4E9ED` · `--brand-burgundy-300 #D98AA3` · `--brand-burgundy-200 #E6A5B9` · `--brand-plum-700 #4A2240` · `--brand-plum-600 #612D53` · `--brand-plum-100 #EFE8EE` · `--brand-plum-300 #CFA0C2` · `--brand-charcoal-900 #2C2C2C` · `--brand-ink-950 #1A1418` (plum charcoal for dark surfaces).

**Role tokens** (Tailwind utility in brackets):

| Role | Light | Dark | Use |
|---|---|---|---|
| surface (`bg-surface`) | `#F3F4F4` | `#1A1418` | page background |
| surface-raised (`bg-surface-raised`) | `#FFFFFF` | `#251D23` | cards, header, dialogs, inputs |
| surface-sunken (`bg-surface-sunken`) | `#EBECEC` | `#140F13` | image frames, hover fills; never behind inputs |
| fg (`text-fg`) | `#2C2C2C` | `#F1EDEF` | body text, headings |
| fg-muted (`text-fg-muted`) | `#5A5A5A` | `#C2B8BE` | secondary text |
| fg-subtle (`text-fg-subtle`) | `#6B6B6B` | `#9E9399` | captions, hints, eyebrows |
| line (`border-line`) | `#E2E3E3` | `#3A2F37` | dividers, card borders (decorative) |
| line-strong (`border-line-strong`) | `#8A8A8A` | `#7A6D75` | input and control borders |
| accent (`bg-accent`, `text-accent`) | `#853953` | `#D98AA3` | primary actions, links |
| accent-hover | `#6E2E44` | `#E6A5B9` | hover and pressed primary |
| on-accent (`text-on-accent`) | `#FFFFFF` | `#1A1418` | text on accent and danger fills |
| accent-subtle | `#F4E9ED` | `#3A2230` | selected chips, accent badges |
| accent-subtle-fg | `#6E2E44` | `#EDB3C5` | text on accent-subtle |
| secondary (`text-secondary`) | `#612D53` | `#CFA0C2` | display headings, secondary emphasis |
| focus | `#612D53` | `#E6A5B9` | focus ring |
| success | `#2F6B4F` | `#7BD3A1` | success text and icons |
| success-subtle / success-subtle-fg | `#E6F2EC` / `#2F6B4F` | `#16302A` / `#7BD3A1` | success badge |
| warning | `#8A5A00` | `#E8BE5C` | warning text and icons |
| warning-subtle / warning-subtle-fg | `#FBF1DC` / `#8A5A00` | `#33280F` / `#E8BE5C` | warning badge |
| danger | `#B42318` | `#F49A90` | errors, destructive button fill |
| danger-hover | `#8F1C13` | `#F7B1A9` | destructive button hover |
| danger-subtle / danger-subtle-fg | `#FBE9E7` / `#B42318` | `#3A1C1A` / `#F49A90` | danger badge, error banners |

The mockup's `charcoal.muted #8A8A8A` fails AA as text (3.13:1 on canvas), so it is used only as `line-strong`. `line-strong` on `surface-sunken` in light is 2.92:1, so inputs never sit on a sunken surface.

**Contrast table** (computed ratios; AC-2 rechecks them through axe):

| Pair | Light | Dark | Needs |
|---|---|---|---|
| fg on surface / raised | 12.67 / 13.97 | 15.64 / 14.16 | 4.5 |
| fg-muted on surface / raised | 6.26 / 6.90 | 9.41 / 8.52 | 4.5 |
| fg-subtle on surface / raised | 4.84 / 5.33 | 6.12 / 5.54 | 4.5 |
| accent (as text) on surface / raised | 7.04 / 7.76 | 7.01 / 6.35 | 4.5 |
| on-accent on accent / accent-hover | 7.76 / 9.83 | 7.01 / 9.03 | 4.5 |
| on-accent on danger / danger-hover | 6.57 / 8.96 | 8.53 / 10.21 | 4.5 |
| accent-subtle-fg on accent-subtle | 8.29 | 8.17 | 4.5 |
| success / warning / danger subtle pairs | 5.48 / 5.28 / 5.61 | 7.83 / 8.24 / 7.25 | 4.5 |
| secondary on surface / raised | 9.49 / 10.46 | 8.18 / 7.40 | 4.5 |
| success, danger, warning on surface (lowest) | 5.38 | 8.53 | 4.5 |
| line-strong vs surface / raised | 3.13 / 3.45 | 3.69 / 3.34 | 3.0 |
| focus vs surface / raised | 9.49 / 10.46 | 9.03 / 8.17 | 3.0 |

**Theme mechanics**: the inline script resolves `system` to `light` or `dark` before writing `data-theme`, so CSS needs one selector per theme. `color-scheme` follows, so native controls and scrollbars match. `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));` redefines Tailwind's `dark:` for the rare component that needs it (for example, swapping a logo); it is not used for colors.

**Type**: `--font-display` Playfair Display (400, 500, 600) · `--font-sans` Inter (400, 500, 600) · `--font-bangla` Hind Siliguri (400, 500, 600), declared in `@theme`. Scale (size / line height): `xs 12/16` · `sm 14/20` · `base 16/24` · `lg 18/28` · `xl 20/28` · `2xl 24/32` · `3xl 30/36` · `4xl 36/40` · `5xl 48/52` · `6xl 60/64`. Display headings use `font-display`; everything else uses `font-sans`. Eyebrow labels: `text-xs uppercase tracking-[.18em] text-fg-subtle`. `:lang(bn) { font-family: var(--font-bangla); line-height: 1.7; }` for body text (Bangla glyphs are taller).

**Spacing, layout, shape**: Tailwind's default 4px spacing scale. Page container `max-w-7xl` with `px-4 sm:px-6 lg:px-8`. Default breakpoints. Radii: controls `rounded-full` (buttons, chips) · inputs `rounded-xl` · cards and dialogs `rounded-2xl` · hero media `rounded-[28px]`. Shadows as `@theme` tokens `--shadow-soft` and `--shadow-lift` (mockup values in light); dark overrides use a black base at higher opacity, since a plum tint does not read on dark surfaces.

**Motion**: `@theme { --transition-duration-fast: 150ms; --transition-duration-base: 200ms; }` (Tailwind 4 reads `duration-*` from this namespace), ease out. Allowed: color and opacity fades, the card lift (`-translate-y-0.5` plus `shadow-lift`), dialog fade and scale. A global `@media (prefers-reduced-motion: reduce)` block sets every transition and animation duration to `0.01ms`.

**Class merging**: `lib/cn.ts` exports `cn(...inputs) = twMerge(clsx(inputs))`, where `twMerge` comes from `extendTailwindMerge` taught the custom theme keys: shadow sizes `soft` and `lift`, durations `fast` and `base`, every role color name, and the `display` and `bangla` font families. Otherwise a caller override such as `shadow-lift` would not replace `shadow-soft`.

### Component inventory

All are hand written in TypeScript, server components unless marked **client**. Variants are declared with `cva`; every component accepts `className`, merged through `cn()` so a caller's override wins.

| Component | Path | Variants and states | Notes |
|---|---|---|---|
| Button | `components/ui/button.tsx` | intent `primary` · `secondary` · `ghost` · `danger`; size `sm` · `md` · `lg`; `icon` (square, needs `aria-label`); `loading` (spinner, `aria-busy`, disabled); disabled | `<button>` by default; with `href` it renders `next/link` for internal paths (starting with `/`) and `<a rel="noopener">` for external ones |
| Input, Textarea | `components/ui/input.tsx` | default · invalid (`aria-invalid`) · disabled | on `surface-raised` only |
| Select | `components/ui/select.tsx` | same states | native `<select>`, styled |
| Checkbox | `components/ui/checkbox.tsx` | **client**; checked · indeterminate · disabled | native input; `indeterminate` set through a ref; 24px minimum target |
| Radio | `components/ui/radio.tsx` | checked · disabled | native input; 24px minimum target |
| Field | `components/ui/field.tsx` | label, hint, error | wires `id`, `aria-describedby`, `aria-invalid`; props `error?: string` and `showError?: boolean`, passed by the form after its first submit; the error renders with `role="alert"` only when `showError` is true |
| Container, Section | `components/ui/layout.tsx` | Section `tone` `default` · `raised` · `accent` | |
| SiteHeader | `components/chrome/site-header.tsx` | desktop · below `lg` | static shell; wordmark, live header links from `lib/nav.ts`, `ThemeToggle`, `<Suspense fallback={<AccountSlotSkeleton/>}><AccountSlot/></Suspense>`, mobile menu trigger |
| Wordmark | `components/chrome/wordmark.tsx` | | text logo as in the mockup: "Aurevia" in `font-display` with the eyebrow "Estates · Sylhet"; links to `/` with `aria-label="Aurevia Estates home"` |
| MobileMenu | `components/chrome/mobile-menu.tsx` | **client**; open · closed | a `Dialog` drawer from the right; the trigger has `aria-expanded` and `aria-controls`; holds the live links and the theme toggle |
| AccountSlot | `components/chrome/account-slot.tsx` | signed out · signed in | async server component; calls `getSessionUser()`; signed out renders a Sign in `Button` (`href=routes.signIn`); signed in renders `AccountMenu` and `ThemeSync` |
| AccountMenu | `components/chrome/account-menu.tsx` | **client** | `Menu` trigger shows `Avatar`; items: name and email (static, not a menu item), Dashboard (role `AGENT` only, `routes.dashboard`), the live `account` entries from `lib/nav.ts` (Saved homes once feature 14 sets it live), Sign out (calls the sign out action from feature 5) |
| Avatar | `components/ui/avatar.tsx` | `sm` · `md` | `next/image` for `avatar_url`; on null or error, initials on `accent-subtle`: first letters of the first two words of `full_name`, else the first letter of `email`, uppercased |
| ThemeToggle | `components/chrome/theme-toggle.tsx` | **client** | a `Menu` with three `menuitemradio` items; the trigger shows sun, moon, or monitor, picked by CSS from `[data-theme-pref]` so server and client markup match |
| ThemeSync | `components/chrome/theme-sync.tsx` | **client** | receives `accountPreference: "SYSTEM" \| "LIGHT" \| "DARK" \| null`; runs the AC-5 reconciliation once on mount, per the *Sync reconciliation* table in [spec 0024](../0024-light-theme-default.md) |
| SiteFooter | `components/chrome/site-footer.tsx` | | live `footer` entries from `lib/nav.ts`; static |
| LanguageToggle | `components/ui/language-toggle.tsx` | **client**; `en` · `bn` pressed | two button `aria-pressed` group for the chat (feature 7); not placed in the header |
| Dialog | `components/ui/dialog.tsx` | **client**; open · closed | native `<dialog>` with `showModal()`; `aria-labelledby` its title; backdrop click closes (hand coded: click whose target is the dialog element itself); scroll lock through `html:has(dialog[open]) { overflow: hidden; }`; stores and restores the trigger's focus on close; calls `toaster.raise()` after opening |
| Menu | `components/ui/menu.tsx` | **client** | `popover="auto"` opened with `popovertarget` (so Escape restores focus natively); `role="menu"` with `menuitem` or `menuitemradio` children, `aria-haspopup="menu"` and `aria-expanded` on the trigger; arrow keys, Home, End move focus; positioned in JS below the trigger and flipped to stay in the viewport (no CSS anchor positioning); below `sm` it opens as a bottom sheet |
| Toaster, toast | `components/ui/toast.tsx` | **client**; `info` · `success` · `danger`; auto dismiss 5s, `danger` stays until closed | `<Toaster/>` is mounted once in `app/layout.tsx`, present from the first render; it is a `popover="manual"` element so it sits in the top layer above modal dialogs, with `raise()` re showing it after any `showModal()`. Holds an `aria-live="polite"` region (danger uses `role="alert"`). `toast({ tone, title, body? })` pushes to a module level store any client component can import. Bottom center on mobile, bottom right from `md`; pauses on hover and focus |
| Badge | `components/ui/badge.tsx` | `neutral` · `accent` · `success` · `warning` · `danger` | subtle background with its `*-subtle-fg` text |
| Skeleton | `components/ui/skeleton.tsx` | | shimmer off under reduced motion |
| Spinner | `components/ui/spinner.tsx` | `sm` · `md` | `role="status"` with a visually hidden label |
| EmptyState, ErrorState | `components/ui/state.tsx` | icon, title, body, optional action | ErrorState offers a retry action |
| VisuallyHidden | `components/ui/visually-hidden.tsx` | | |
| PropertyCard | `components/listing/property-card.tsx` | layout `grid` · `list` | takes `ListingCardDTO`, `href` (default `/properties/[slug]`, the route built by feature 10), optional `favorite?: { pressed, onToggle }`; stretched link pattern: the title `<a>` has an `::after` covering the card, the heart sits above it with a higher `z-index` |
| PriceTag | `components/listing/price-tag.tsx` | size `sm` · `lg` | `formatPrice`; plus a "Negotiable" `Badge` when `priceNegotiable` |
| SpecChips | `components/listing/spec-chips.tsx` | | per the *Spec chips* table |
| FavoriteButton | `components/listing/favorite-button.tsx` | **client**; pressed · not pressed · pending | fixed label "Save home" with `aria-pressed` only; rendered by PropertyCard only when `favorite` is passed (feature 14 wires it) |
| ListingImage | `components/listing/listing-image.tsx` | **client** (for the error fallback) | `next/image` with `fill` and `sizes` (grid: `(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw`; list: `(min-width:640px) 280px, 100vw`) inside a tinted `bg-surface-sunken` frame with a house icon; `unoptimized` when the URL host is not in `remotePatterns`; on error hides the image and keeps the frame |

### Listing card data

`ListingCardDTO` (exported from `lib/domain/listing-card.ts`; `serializeListing` in spec 0002 produces it, with `toCardDTO` picking these fields):

| Field | Type | Source |
|---|---|---|
| slug | string | `listings.slug` |
| title | string | `listings.title` |
| areaName | string | `areas.name_en` |
| propertyType | `property_type` enum | `listings.property_type` |
| priceBdt | number (whole taka) | `listings.price_bdt` via `toTaka` |
| priceNegotiable | boolean | `listings.price_negotiable` (spec 0002) |
| bedrooms, bathrooms | number \| null | `listings.bedrooms`, `listings.bathrooms` |
| builtUpSqft | number \| null | `listings.built_up_sqft` |
| landKatha | number \| null | `listings.land_katha` via `toKatha` |
| cover | `{ url: string; alt: string }` \| null | the cover `listing_photos` row: `url` through `photoUrl`, `alt` from `listing_photos.alt` (spec 0002 already defaults it to the title) |

### Spec chips

| Property type | Chips, in order |
|---|---|
| APARTMENT | beds · baths · sqft |
| DUPLEX, VILLA, HOUSE | beds · baths · sqft · katha |
| PLOT | katha |
| COMMERCIAL | sqft |

A chip whose value is null is hidden. Formats: `1 bed` / `3 beds`, `1 bath` / `2 baths`, `1,450 sqft` (`en-US` grouping), `5.5 katha` (up to 2 decimals, trailing zeros dropped). Each chip has a Lucide icon (`BedDouble`, `Bath`, `Ruler`, `LandPlot`) marked `aria-hidden`.

### Navigation

`lib/nav.ts` exports `routes` (one place for paths other features own) and `nav`:

```ts
export const routes = { home: "/", assistant: "/assistant", signIn: "/sign-in", dashboard: "/dashboard" } as const;

type NavEntry = { label: string; href: string; live: boolean; placement: ("header" | "footer" | "account")[] };

export const nav: NavEntry[] = [
  { label: "Buy", href: "/properties", live: false, placement: ["header", "footer"] },          // feature 11
  { label: "Explore map", href: "/properties?view=map", live: false, placement: ["header"] },   // feature 13
  { label: "Sell", href: "/about#contact", live: false, placement: ["header", "footer"] },      // feature 15
  { label: "AI Assistant", href: routes.assistant, live: true, placement: ["header", "footer"] },
  { label: "About & contact", href: "/about", live: false, placement: ["header", "footer"] },   // feature 15
  { label: "Saved homes", href: "/saved", live: false, placement: ["account"] },                // feature 14
  { label: "Privacy", href: "/privacy", live: false, placement: ["footer"] },                   // feature 17
  { label: "Terms", href: "/terms", live: false, placement: ["footer"] },                       // feature 17
];
```

The mockup's "Rent" link is dropped (listings are sale only, spec 0002). Features 5 and 7 may change `routes.signIn` and `routes.assistant` if they pick other paths; each feature flips its own entry to `live: true`.

### Data model

One additive change to `profiles` (spec 0002), in this feature's own migration `theme_preference`:

| Table | Column | Type | Null | Default |
|---|---|---|---|---|
| `profiles` | `theme_preference` | enum `theme_preference` (`SYSTEM`, `LIGHT`, `DARK`) | yes | none; null means the user never chose |

It needs `core_slice1` (spec 0002) applied first. Account deletion (0002 AC-10) leaves it as is; it is not personal data.

### API surface

| Action | Kind | Inputs | Output | Auth | Errors |
|---|---|---|---|---|---|
| `setThemePreference` (`app/actions/theme.ts`) | server action | `preference: "SYSTEM" \| "LIGHT" \| "DARK"` (Zod) | `{ ok: true }` | signed in; identity from `getCurrentUser()` (spec 0001); any role | signed out → `{ ok: false, reason: "unauthenticated" }`; bad input → `{ ok: false, reason: "invalid" }`; database error → `{ ok: false, reason: "failed" }`. Never throws to the client |
| `getSessionUser()` (`lib/server/auth.ts`, alongside 0001's helpers) | server read, read only | session cookie | `{ id, role, email, fullName, avatarUrl, themePreference } \| null` | n/a | verifies the session with Supabase on the server; returns null when signed out, when no profile row exists yet, or when `deleted_at` is set; never inserts or updates |
| `formatPrice(bdt: number)` (`lib/format.ts`) | pure function | whole taka | `"BDT 12,500,000"` via `Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })` | n/a | throws on a non finite or negative number |
| `formatSqft`, `formatKatha`, `pluralize` (`lib/format.ts`) | pure functions | number | per *Spec chips* | n/a | throw on a non finite number |
| `toCardDTO(serialized)` (`lib/domain/listing-card.ts`) | pure function | `serializeListing` result | `ListingCardDTO` | n/a | none |

**Theme client store** (`lib/theme.ts`): the single source in the browser. It holds the map between browser values (`light`, `dark`, `system`) and database values (uppercase enum), the inline script source string (built from the same constants), and a store read through `useSyncExternalStore`. `setPreference(p)` writes `localStorage["aurevia-theme"]` (in `try/catch`), updates `data-theme`, `data-theme-pref`, and `colorScheme`, and dispatches an `aurevia-theme` window event. The store owns the one `matchMedia` listener (active only when the choice is `system`) and listens to the `storage` event for other tabs. Pending flag: `localStorage["aurevia-theme-pending"] = "1"` while a save has failed; cleared on the next successful save.

### Value sourcing

| Action | Value produced / displayed | Source |
|---|---|---|
| Inline theme script | applied theme | `localStorage["aurevia-theme"]`, else `light` ([spec 0024](../0024-light-theme-default.md)); `system` resolved by `matchMedia("(prefers-color-scheme: dark)")` |
| ThemeToggle | current choice | theme client store; icon by CSS from `data-theme-pref` |
| ThemeSync | account preference | `profiles.theme_preference` via `getSessionUser()` in `AccountSlot`, passed as a prop |
| ThemeSync | whether to retry | `localStorage["aurevia-theme-pending"]` |
| setThemePreference | user to update | `getCurrentUser().id` (spec 0001), never client input |
| AccountSlot | signed in or not, role | `getSessionUser()` |
| Avatar | image or initials | `profiles.avatar_url`; initials from `full_name`, else `email` |
| AccountMenu | Dashboard item shown | `role === "AGENT"` from `getSessionUser()` |
| PropertyCard | every displayed field | `ListingCardDTO` (table above) |
| PriceTag | `BDT 12,500,000`, Negotiable badge | `priceBdt` through `formatPrice`; `priceNegotiable` |
| SpecChips | which chips, their text | `propertyType` and the *Spec chips* table; values through `lib/format.ts` |
| ListingImage | optimized or not | URL host checked against the `remotePatterns` host list exported from `lib/images.ts` (also imported by `next.config.ts`) |
| SiteHeader, SiteFooter | links | `lib/nav.ts` entries with `live: true` and the matching `placement` |
| Fonts | font files | Google Fonts CSS link in `app/layout.tsx` |
| `/styleguide` | shown or 404 | `NODE_ENV` and `ENABLE_STYLEGUIDE` via `lib/env.ts` |

### Key invariants

- Components never reference a brand ramp variable, a raw color, or a default Tailwind palette color; only role tokens.
- The header shell and footer never read cookies or the session; only `AccountSlot` does, and only through `getSessionUser()`.
- The inline script always applies the theme first; React never decides the initial theme.
- A failed save never changes what the user sees.
- No interactive element is nested inside another (no button inside a link).
- Every icon only button has an accessible name; decorative icons carry `aria-hidden="true"`.

### Security model

- `setThemePreference` updates only the caller's own profile row, identified on the server. No other field is writable through it.
- `getSessionUser()` verifies the session on the server (never trusts an unverified cookie, per spec 0001) and is read only, so rendering the header never writes.
- The inline script is a fixed string built at compile time from `lib/theme.ts`; it reads only local storage and never includes user content. When a Content Security Policy is added, it needs a hash or nonce for this script and must allow `fonts.googleapis.com` and `fonts.gstatic.com`.
- Visitor IP addresses reach Google on every page load because fonts come from Google's servers; feature 17 (privacy) must list Google Fonts as a third party.
- Pasted photo URLs from other hosts load directly in the visitor's browser (`unoptimized`), so those hosts see visitor IPs; feature 20 ends this by moving photos to Supabase Storage.
- `/styleguide` returns 404 in production unless `ENABLE_STYLEGUIDE=true`, which is set only in CI.

### Configuration required

- `ENABLE_STYLEGUIDE`: optional server flag (`"true"` or unset), added to `lib/env.ts`; set only in the CI job that runs axe against a production build. Never set on Vercel.
- `next.config.ts`: `images.remotePatterns` for `https://images.unsplash.com/**` and `https://lh3.googleusercontent.com/**`, from `lib/images.ts`. Next 16 allows only quality `75` by default (`images.qualities`); keep the default.
- New dependencies: `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`. New dev dependencies: `eslint-plugin-jsx-a11y` (added directly so its config can be imported) and the axe runner `/test` picks for the project (for example `@axe-core/playwright`).

### Critical test scenarios

- Theme first paint: local storage `dark`, load the homepage with JavaScript slowed; the first painted frame is dark, verifies **AC-3**.
- Unreadable storage: local storage throws; the page renders light with no error ([spec 0024](../0024-light-theme-default.md)), verifies **AC-3**.
- System follow: with `system`, flip the device color scheme; the page changes without reload, verifies **AC-3**.
- Two tabs: change the theme in one; the other updates, verifies **AC-4**.
- First sign in: account null, local `dark`; after sign in the account becomes `DARK` and the page stays dark, verifies **AC-5**.
- Account wins: account `DARK`, local `light`, no pending flag; the page turns dark and local storage becomes `dark`, verifies **AC-5**.
- Save failure: the save fails; the theme stays, the pending flag is set, and the next load retries the save instead of applying the stale account value, verifies **AC-5**.
- Caching: `next build` shows the homepage as static or partially prerendered, verifies **AC-6**.
- Dialog: open with keyboard, press Tab many times; focus never lands on page content behind it; Escape closes and focus returns to the trigger; a backdrop click closes, verifies **AC-9**.
- Toast over dialog: open a Dialog, fire `toast()`; the toast is visible and its close button works, verifies **AC-16**.
- axe on `/styleguide` in light and dark (production build with `ENABLE_STYLEGUIDE=true`): zero serious or critical, verifies **AC-2**, **AC-10**.
- Reduced motion: emulate `reduce`; card and skeleton have effectively zero transition time, verifies **AC-11**.
- Card: a plot shows only katha; an apartment with null baths hides the bath chip; no photo and a broken photo both show the frame; a photo on an unlisted host renders unoptimized; the heart is absent without `favorite`, verifies **AC-12**.
- Formats: `formatPrice(12500000)` is `BDT 12,500,000`; `formatKatha(5.5)` is `5.5 katha`; `pluralize(1, "bed")` is `1 bed`; a negative price throws, verifies **AC-12**.
- Production guard: `/styleguide` with `NODE_ENV=production` and no flag returns 404, verifies **AC-8**.

## Standard definition

**Canonical pattern**:
```tsx
// components/ui/button.tsx
import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const button = cva(
  "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      intent: {
        primary: "bg-accent text-on-accent hover:bg-accent-hover",
        secondary: "border border-line-strong bg-surface-raised text-fg hover:bg-surface-sunken",
        ghost: "text-fg hover:bg-surface-sunken",
        danger: "bg-danger text-on-accent hover:bg-danger-hover",
      },
      size: { sm: "h-9 px-4 text-sm", md: "h-11 px-5 text-sm", lg: "h-12 px-6 text-base" },
    },
    defaultVariants: { intent: "primary", size: "md" },
  },
);

type Props = VariantProps<typeof button> & { className?: string } & (
  | ({ href?: undefined } & React.ComponentProps<"button">)
  | ({ href: string } & Omit<React.ComponentProps<"a">, "href">)
);

export function Button({ intent, size, className, ...props }: Props) {
  const classes = cn(button({ intent, size }), className);
  if (props.href !== undefined) {
    return props.href.startsWith("/")
      ? <Link {...props} href={props.href} className={classes} />
      : <a rel="noopener" {...props} className={classes} />;
  }
  return <button type="button" {...props} className={classes} />;
}
```

**Replaces**:
- Mockup color names in components (`bg-burgundy`, `text-charcoal-soft`), raw hex values, and default palette colors.
- Paired `dark:` classes on components to theme them.
- Copying long class strings between pages instead of using a kit component.
- Custom focus trap code for dialogs and menus.
- `outline-none` without a `focus-visible` replacement.
- A button or link nested inside a link.

**Enforcement**:
- Tailwind: `--color-*: initial` in `@theme` makes default palette utilities fail to generate, and the brand ramp sits outside `@theme`, so neither can be used by accident.
- ESLint (`eslint.config.mjs`): a rules block that merges `jsxA11y.flatConfigs.strict.rules` (rules only, since `eslint-config-next` already registers the plugin), plus `no-restricted-syntax` selectors on `Literal` and `TemplateElement` values under `components/**` and `app/**` matching `#[0-9a-fA-F]{3,8}\b`, `rgba?\(`, `hsla?\(`, and `brand-`. A file override turns that rule off for `app/styleguide/**`. Fails CI.
- axe on `/styleguide` in both themes inside `/test` and `/check verify`.
- Review rule: a new color or component state lands in `design.md` and `/styleguide` in the same change.

**Rollout**: New code immediately. There is no app UI to migrate (only the create next app starter, replaced in the first build task).

**Exceptions**: `app/globals.css` (defines the tokens) and `app/styleguide/**` (shows ramp swatches). Third party embeds such as MapLibre maps (feature 13) style their own canvas.

## Build plan

Tracer Bullet: first a thin thread through every layer (tokens, theme script, one component, header, styleguide, lint, axe), then thicken.

1. Thin thread: replace the starter `globals.css` and `app/layout.tsx` with the tokens for both themes (default palette off), the Google Fonts link, the `:lang(bn)` rule, the motion tokens and reduced motion block, `lib/theme.ts` with the inline script and client store, and a minimal `ThemeToggle`; add `lib/cn.ts` (configured `extendTailwindMerge`), `Button`, a static `SiteHeader` shell with `Wordmark` and `lib/nav.ts`, `ENABLE_STYLEGUIDE` in `lib/env.ts`, and `/styleguide` showing Button in both themes; wire the jsx-a11y strict rules, the color lint rule, and one axe run on `/styleguide`, satisfies **AC-1**, **AC-3**, **AC-4**, **AC-7**, **AC-8**, **AC-10**, **AC-11**, **AC-13**
2. Core controls: Input, Textarea, Select, Checkbox, Radio, Field, VisuallyHidden, Badge, with all states on `/styleguide`, satisfies **AC-2**, **AC-8**, **AC-9**
3. Feedback and overlays: Dialog, Menu (move ThemeToggle onto it), Toaster and `toast()`, Skeleton, Spinner, EmptyState, ErrorState, LanguageToggle, satisfies **AC-8**, **AC-9**, **AC-11**, **AC-16**
4. Chrome: full SiteHeader, MobileMenu, SiteFooter, Avatar, `getSessionUser()`, AccountSlot with its Suspense skeleton (signed out branch only until feature 5 lands); `lib/images.ts` with the `remotePatterns` hosts; confirm the build keeps the homepage static or partial, satisfies **AC-6**, **AC-9**, **AC-13**, **AC-14**
5. Real estate pieces: `lib/format.ts`, `toCardDTO` and `ListingCardDTO`, PriceTag, SpecChips, ListingImage, FavoriteButton, PropertyCard (grid and list) against fixture DTOs, satisfies **AC-12**, **AC-14**
6. Account theme sync (needs `core_slice1` from spec 0002 and sign in from feature 5): migration `theme_preference`, `setThemePreference`, AccountMenu, ThemeSync with the pending retry, satisfies **AC-5**, **AC-6**
7. Write root `design.md` from the built tokens and kit, including the contrast table, satisfies **AC-15**

## Consequences

**Positive**:
- Dark mode is a token swap, so features never write theme specific classes.
- No component library dependency; the team owns every line, and native `<dialog>` and Popover carry much of the accessibility work.
- Public pages stay cached with an account synced theme.

**Negative / tradeoffs**:
- Hand written components mean more code to write and maintain than shadcn/ui; Menu positioning, the dialog backdrop click, scroll lock, and toasts over dialogs are all hand coded, and later widgets (feature 8's time picker, feature 11's filters) must be built and tested by hand.
- Two themes double the visual checks for every component and page.
- Google Fonts by link adds a third party request per visit (privacy disclosure, CSP entries, slower first text on slow networks) compared with self hosting.
- International grouping (`BDT 12,500,000`) is less familiar to local buyers, who think in lakh and crore.
- Every page's header keeps one small dynamic hole for the account slot.

**Neutral**:
- `profiles` gains one nullable column through a small additive migration that must follow `core_slice1`.
- `lib/server/auth.ts` gains `getSessionUser()` next to spec 0001's helpers.

## Follow-up

- [ ] Amend spec 0001's caching rule: public pages may read the session only inside a `<Suspense>` wrapped slot, and only through the read only `getSessionUser()`; `getCurrentUser()` (which inserts a profile) stays out of public render paths.
- [ ] Note back in spec 0002: `profiles.theme_preference` (nullable) added by migration `theme_preference`, and `ListingCardDTO` with `toCardDTO` defined here as the card shape of `serializeListing`.
- [ ] Feature 17 (privacy) lists Google Fonts, and pasted photo hosts, as third parties that receive visitor IP addresses; revisit self hosting with `next/font` if consent or speed becomes a problem.
- [ ] When a Content Security Policy is added, include a hash or nonce for the inline theme script and the Google Fonts hosts.
- [ ] Agent Skills for Lucide, cva, tailwind-merge, axe, and jsx-a11y were deferred (not declined); offer them again when `/audit` runs.
- [ ] `/audit` should capture the token and component rules in root `AGENTS.md` `## Rules` (they apply to every UI file) with a pointer to `design.md`.
- [ ] Revisit the price format with real buyers; a lakh and crore display would be a change to `formatPrice` only.
