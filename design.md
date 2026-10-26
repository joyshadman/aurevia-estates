# Aurevia Estates design system

The visual source of truth for every page. Decided in [spec 0003](docs/specs/0003-design-system-ui-foundation/index.md); tokens live in `app/globals.css`, components in `components/`. See them all, in both themes, at `/styleguide` (dev only).

**Character**: calm, warm, premium. Canvas grey surfaces, burgundy for action, plum for emphasis, Playfair Display headlines over Inter body text. Generous space, pill shaped controls, soft cards that lift on hover.

## Rules (enforced)

- **Use role tokens only.** `bg-surface`, `text-fg`, `bg-accent`, `border-line`… Never hex, `rgb()`, or brand ramp names in components. Tailwind's default palette is switched off, and `npm run lint` rejects raw colors outside `app/globals.css` and `app/styleguide/`.
- **Never theme with `dark:` classes.** Dark mode swaps token values. `dark:` exists only for rare non color cases (a logo swap).
- **Use the kit before writing new markup.** A new color or component state goes into `globals.css`, this file, and `/styleguide` in the same change.
- **Accessibility target: WCAG 2.2 AA.** jsx-a11y strict rules in lint; axe on `/styleguide` in both themes (`npm run test:e2e`).

## Color

Two layers: the brand ramp (raw values, `:root` in `globals.css`, never used directly) and role tokens (what components use). Light values sit in `@theme`; dark overrides sit under `:root[data-theme="dark"]`.

| Role | Light | Dark | Use |
|---|---|---|---|
| `surface` | `#F3F4F4` | `#1A1418` | page background |
| `surface-raised` | `#FFFFFF` | `#251D23` | cards, header, dialogs, inputs |
| `surface-sunken` | `#EBECEC` | `#140F13` | image frames, hover fills; never behind inputs |
| `fg` | `#2C2C2C` | `#F1EDEF` | body text, headings |
| `fg-muted` | `#5A5A5A` | `#C2B8BE` | secondary text |
| `fg-subtle` | `#6B6B6B` | `#9E9399` | captions, hints, eyebrows |
| `line` | `#E2E3E3` | `#3A2F37` | dividers, card borders (decorative) |
| `line-strong` | `#8A8A8A` | `#7A6D75` | input and control borders |
| `accent` / `accent-hover` | `#853953` / `#6E2E44` | `#D98AA3` / `#E6A5B9` | primary actions, links |
| `on-accent` | `#FFFFFF` | `#1A1418` | text on accent and danger fills |
| `accent-subtle` / `-fg` | `#F4E9ED` / `#6E2E44` | `#3A2230` / `#EDB3C5` | selected chips, accent badges |
| `secondary` | `#612D53` | `#CFA0C2` | display emphasis |
| `focus` | `#612D53` | `#E6A5B9` | focus ring |
| `success`, `-subtle`, `-subtle-fg` | `#2F6B4F`, `#E6F2EC`, `#2F6B4F` | `#7BD3A1`, `#16302A`, `#7BD3A1` | confirmed states |
| `warning`, `-subtle`, `-subtle-fg` | `#8A5A00`, `#FBF1DC`, `#8A5A00` | `#E8BE5C`, `#33280F`, `#E8BE5C` | cautions |
| `danger`, `-hover`, `-subtle`, `-subtle-fg` | `#B42318`, `#8F1C13`, `#FBE9E7`, `#B42318` | `#F49A90`, `#F7B1A9`, `#3A1C1A`, `#F49A90` | errors, destructive actions |
| `feature` | `#612D53` | `#4A2240` | the plum feature band (homepage assistant promo) |
| `on-media`, `-muted`, `-accent` | white, white 82%, `#E9C9D4` | same | text on photos and on `feature`; never on light surfaces |
| `media-scrim`, `media-glass`, `media-line` | ink 80%, white 12%, white 30% | same | the gradient under text on photos, glass cards and their borders |
| `overlay` | charcoal 55% | black 65% | dialog backdrop |

The mockup's `#8A8A8A` fails AA as text (3.13:1), so it is only `line-strong`. `line-strong` on `surface-sunken` is 2.92:1 in light: inputs never sit on sunken surfaces.

### Contrast (measured)

| Pair | Light | Dark | Needs |
|---|---|---|---|
| fg on surface / raised | 12.67 / 13.97 | 15.64 / 14.16 | 4.5 |
| fg-muted on surface / raised | 6.26 / 6.90 | 9.41 / 8.52 | 4.5 |
| fg-subtle on surface / raised | 4.84 / 5.33 | 6.12 / 5.54 | 4.5 |
| accent text on surface / raised | 7.04 / 7.76 | 7.01 / 6.35 | 4.5 |
| on-accent on accent / accent-hover | 7.76 / 9.83 | 7.01 / 9.03 | 4.5 |
| on-accent on danger / danger-hover | 6.57 / 8.96 | 8.53 / 10.21 | 4.5 |
| accent-subtle-fg on accent-subtle | 8.29 | 8.17 | 4.5 |
| success / warning / danger subtle pairs | 5.48 / 5.28 / 5.61 | 7.83 / 8.24 / 7.25 | 4.5 |
| secondary on surface / raised | 9.49 / 10.46 | 8.18 / 7.40 | 4.5 |
| line-strong vs surface / raised | 3.13 / 3.45 | 3.69 / 3.34 | 3.0 |
| focus vs surface / raised | 9.49 / 10.46 | 9.03 / 8.17 | 3.0 |

## Theme

Light, dark, or system, from the header toggle. An inline script in `<head>` applies the stored choice (`localStorage["aurevia-theme"]`) before first paint and sets `data-theme`, `data-theme-pref`, and `color-scheme` on `<html>`. `lib/theme-client.ts` is the only store: it follows device changes and syncs tabs. Signed in users' choice is also saved to their profile (lands with sign in, spec 0004).

## Type

| Family | Token | Use |
|---|---|---|
| Playfair Display 400/500/600 | `font-display` | headlines, prices |
| Inter 400/500/600 | `font-sans` (default) | everything else |
| Hind Siliguri 400/500/600 | `font-bangla` | any element with `lang="bn"` (automatic, via `:lang(bn)`) |

Scale (size/line height): `xs 12/16` · `sm 14/20` · `base 16/24` · `lg 18/28` · `xl 20/28` · `2xl 24/32` · `3xl 30/36` · `4xl 36/40` · `5xl 48/52` · `6xl 60/64`. Eyebrow: `<Eyebrow>` (xs, uppercase, `.18em` tracking, `fg-subtle`). Bangla body text gets line height 1.7. Fonts load from Google Fonts by link (feature 17 must disclose it).

## Space, layout, shape, elevation, motion

- **Spacing**: Tailwind's 4px scale. Sections `py-16 sm:py-20`.
- **Container**: `<Container>` = `max-w-7xl` with `px-4 sm:px-6 lg:px-8`. Default breakpoints; the header switches to the mobile drawer below `lg`.
- **Radii**: controls `rounded-full` · inputs `rounded-xl` · cards and dialogs `rounded-2xl` · hero media `rounded-[28px]`.
- **Shadows**: `shadow-soft` (resting) and `shadow-lift` (hover, overlays); dark mode uses deeper black based shadows.
- **Motion**: `duration-fast` 150ms, `duration-base` 200ms, ease out. Allowed: color and opacity fades, card lift (`-translate-y-0.5` + `shadow-lift`), image zoom on card hover. Everything is off under `prefers-reduced-motion`.

## Components

`cva` variants, `cn()` for merging (a caller's `className` wins).

| Component | Variants | Use it for |
|---|---|---|
| `Button` | intent `primary` · `secondary` · `ghost` · `danger`; size `sm` · `md` · `lg`; `icon`; `loading`; `href` (internal → `next/link`) | every action; one primary per view |
| `Input`, `Textarea`, `Select` | default · invalid · disabled | form fields, always inside `Field` |
| `Checkbox`, `Radio` | checked · indeterminate (checkbox) · disabled | choices; group in a `fieldset` with a `legend` |
| `Field` | label, hint, error (`showError` after first submit) | wiring labels and errors to a control |
| `Container`, `Section`, `Eyebrow` | Section tone `default` · `raised` · `accent` | page structure |
| `Dialog` | placement `center` · `right` · `left` · `bottom` | confirmations, focused tasks, the mobile drawer (`right`), the chat's conversations drawer (`left`) and brief sheet (`bottom`) |
| `Menu`, `MenuItem`, `MenuItemRadio` | | small action lists (account, theme); bottom sheet below `sm` |
| `toast()` + `Toaster` | `info` · `success` · `danger` (stays until closed) | brief feedback after an action |
| `Badge` | `neutral` · `accent` · `success` · `warning` · `danger` | statuses, match scores |
| `Skeleton`, `Spinner` | `sm` · `md` (spinner) | loading states |
| `EmptyState`, `ErrorState` | icon, title, body, action | empty lists, failed loads (with retry) |
| `Avatar` | `sm` · `md` | user photo, else initials |
| `LanguageToggle` | `en` · `bn` | the chat's reply language |
| `VisuallyHidden` | | text for screen readers only |
| `SiteHeader`, `MobileMenu`, `SiteFooter`, `ThemeToggle`, `Wordmark`, `AccountSlot` | | site chrome (links come from `lib/nav.ts`) |
| `PropertyCard` | layout `grid` · `list`; optional `href`, `favorite`, `badge`, `footer` | any listing summary |
| `PriceTag`, `SpecChips`, `ListingImage`, `FavoriteButton` | | parts of listing views |

Listing display rules: prices `BDT 12,500,000` (`formatPrice`); chips by property type (apartment: beds, baths, sqft; duplex, villa, house: plus katha; plot: katha; commercial: sqft); a null value hides its chip; missing or broken photos show a framed house icon.

## Accessibility rules

- Every interactive element is reachable by Tab in visual order and shows the 2px `focus` ring on `:focus-visible`. Never remove an outline without a replacement.
- Icon only buttons need an `aria-label`; decorative icons get `aria-hidden="true"`. A link's or button's accessible name must contain its visible text.
- No interactive element inside another (cards use the stretched link pattern; the heart is a sibling).
- Dialogs: native `<dialog>` + `showModal()`, closed by Escape, the close button, or the backdrop; focus returns to the opener; the page behind doesn't scroll. Toasts fired while a dialog is open render inside it.
- Menus: Popover API with `popovertarget`; arrow keys, Home, End; Escape returns focus to the trigger.
- Minimum target size 24px; form errors use `role="alert"` only after submit.
- Bangla text is marked `lang="bn"`.
