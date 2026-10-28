# 0024. Light theme as the default for visitors with no saved choice

**Date**: 2026-10-28
**Status**: In Progress

## Summary

A visitor who has never picked a theme now sees the site in light mode, whatever their phone or computer is set to. Dark and System stay in the theme toggle, so anyone who wants dark can still choose it, and that choice is remembered. Only a theme the user actually picked is ever saved to their account; the default is never saved as if it were a choice. This amends spec 0003, AC-3 and AC-5.

## Context

Spec 0003 built light and dark themes at launch and made `system` (follow the device setting) the starting point for anyone with no stored choice. In practice that means a large share of first visits, anyone whose device runs in dark mode, land on the dark palette. The engineer wants the brand's first impression to be the light design: the cream canvas and burgundy accents the mockup was drawn in, and the look the photography and marketing are built around.

The forces: the theme must still apply before first paint with no flash (spec 0003, AC-3); public pages must stay cacheable, so the server cannot read a cookie or the account to pick the theme (root `AGENTS.md`, spec 0001); the dark palette is already measured for contrast and costs nothing to keep (spec 0003, AC-2); and account sync (spec 0003, AC-5, not built yet) reconciles the browser and the account by treating whatever the browser holds as the user's choice.

That last point is the trap. Once the browser's fallback is a concrete value, the planned sync cannot tell "the user picked light" from "the user never picked anything". If it saves the fallback, every account gets `LIGHT` stamped on it on first sign in, and any later change of default never reaches those people.

This code shipped first under an assumption recorded by `/develop` (this spec, then `Assumed`); this record deliberates and ratifies it.

## Requirements

**User stories**:
- As a first time visitor, I want the site to open in its light design so I see Aurevia the way it was designed.
- As a visitor who prefers dark, I want to pick Dark (or System) in the toggle and have it stick.
- As a signed in user, I want only the theme I actually chose to follow me to other devices.

**Acceptance criteria**:
- **AC-1**: With no valid value in `localStorage["aurevia-theme"]` (missing, invalid, or storage unreadable), the page renders light before first paint, with no flash, whatever the device's `prefers-color-scheme`. The server renders `<html data-theme="light" data-theme-pref="light">`.
- **AC-2**: A stored `dark`, `light`, or `system` still applies before first paint exactly as spec 0003, AC-3 describes; a stored `system` still follows live device changes.
- **AC-3**: The toggle still offers Light, Dark, and System (spec 0003, AC-4 unchanged). With nothing stored, it shows Light as the current choice.
- **AC-4**: The default is never treated as a choice. Nothing is written to `localStorage["aurevia-theme"]` until the user uses the toggle, and account sync saves a value to `profiles.theme_preference` only when the browser holds a value the user picked. With the account null and nothing stored, sync does nothing and the page stays light. Picking Light in the toggle is a choice like any other: it stores `light` and saves `LIGHT`, even though it equals the default.
- **AC-5**: When the account holds a value and the browser holds none (a new device), the account value wins, is written to local storage, and is applied without a reload, and the open toggle updates (spec 0003, AC-5 otherwise unchanged). Adopting the account value never triggers a save back to the account.
- **AC-6**: There is no way to "unchoose". Once the toggle is used, a choice stays stored; System is how a user goes back to following the device. No fourth "Default" option is added.
- **AC-7**: A change in another tab applies here, including when that tab removes the key or clears storage (`localStorage.clear()`, which fires a storage event with no key); after a clear, this tab falls back to light.

## Options considered

### Option 1: Light by default, keep all three choices

Change only the fallback: no stored choice means `light`. Dark and System stay in the toggle and keep working.

**Pros**:
- The brand's first impression is fixed for everyone, with a one line change in three places.
- People who prefer dark lose nothing; the measured dark palette stays in use.
- No migration, no change to tokens, toggle markup, or the cacheable page rule.

**Cons**:
- Visitors on a dark device who never chose now see light, which some will find bright at night.
- The sync logic must learn to tell a real choice from the fallback (AC-4).

### Option 2: Light only, remove dark mode

Delete the dark overrides, the toggle, and the inline script.

**Pros**:
- Smallest surface: one palette to design, test, and keep accessible.
- No flash risk at all, and no sync to build.

**Cons**:
- Throws away a palette that is already built and contrast measured.
- Breaks spec 0003, AC-2, AC-4, AC-5, and AC-8 and the `/styleguide` axe checks in both themes; those would need rewriting.
- Hard to reverse once components drift toward light only assumptions.

### Option 3: Keep following the device (spec 0003 as written)

Revert the shipped change.

**Pros**:
- Respects the visitor's system setting, which is the platform convention.
- No spec change.

**Cons**:
- Does not meet the engineer's goal: dark device users, a large share of mobile traffic, keep landing on dark.

## Decision

**Chosen option**: Option 1: Light by default, keep all three choices.

A missing, invalid, or unreadable stored theme resolves to `light`; Light, Dark, and System all stay in the toggle; and only a theme the user picked is ever saved to their account.

## Rationale

The goal is the first impression, not taking choice away. Option 1 changes exactly the one value that decides what an undecided visitor sees, and leaves every working part of spec 0003 (no flash script, cross tab sync, measured dark palette, cacheable pages) as it is. Option 2 buys simplicity the project does not need: the dark theme is already built and paid for, and removing it would rewrite four acceptance criteria of a feature that is otherwise nearly done. Option 3 is the platform convention but is the very behavior the engineer asked to change.

The account rule (AC-4) is what makes the default safe to change again later. Because `localStorage["aurevia-theme"]` is written only by the toggle, its presence is a clean signal that the user chose. Saving only on that signal keeps `profiles.theme_preference` null for people who never chose, exactly as spec 0003 intended ("null means the user never chose"), so a future change of default still reaches them.

## Feature design

**Data model sketch**: no change. `profiles.theme_preference` (nullable enum, spec 0003) keeps meaning "null until the user first chooses".

**API surface**: no change. `setThemePreference` (spec 0003) is still the only write, called from the toggle and from `ThemeSync`.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Inline script (before paint) | applied theme with nothing stored | `DEFAULT_THEME` in `lib/theme.ts` (`"light"`), decided here |
| Inline script | applied theme with a stored choice | `localStorage["aurevia-theme"]`, unchanged from spec 0003 |
| Server render of `<html>` | `data-theme`, `data-theme-pref` | both `DEFAULT_THEME` in `app/layout.tsx`; the constant is typed `Exclude<ThemePreference, "system">`, so it is always a valid `data-theme` |
| Theme toggle | current choice shown | `useThemePreference()`, which falls back to `DEFAULT_THEME`; server snapshot is `DEFAULT_THEME` |
| `ThemeSync` | whether the user has chosen | `getStoredChoice()` in `lib/theme-client.ts`: the valid stored value, or `null` when missing, invalid, or unreadable. `getStoredPreference()` is `getStoredChoice() ?? DEFAULT_THEME`, so the validity rule lives once |
| `ThemeSync` | value saved to the account | the `getStoredChoice()` value, only when not `null` |
| `ThemeSync` (account wins) | theme applied and stored | the account value, written by `adoptPreference()`: writes storage, applies, and dispatches the theme event so the toggle updates, but never calls `setThemePreference` |
| Storage listener | theme after another tab changes or clears storage | `getStoredPreference()`, read again on any storage event whose key is `aurevia-theme` or `null` |

**Sync reconciliation** (once per signed in page load; R = `getStoredChoice()`, A = the account value, P = the pending flag):
| P | R | A | What happens |
|---|---|---|---|
| set | present | any | retry saving R; keep R applied (spec 0003, AC-5) |
| set | null | any | clear P, then continue with the rows below; never retry a save of the fallback |
| clear | present | null | save R to the account |
| clear | null | null | do nothing; the page stays light |
| clear | null | set | adopt A (AC-5) |
| clear | present, equal to A | set | do nothing |
| clear | present, differs from A | set | the account wins and A is adopted (spec 0003, AC-5, ratified as is: a choice made signed out on this device gives way to the account) |

**Key invariants**:
- The fallback lives in one constant, `DEFAULT_THEME`, used by the inline script, the client store, its server snapshot, and the layout.
- Only the toggle (`setPreference`) and the account adoption path (`adoptPreference`) write `localStorage["aurevia-theme"]`; nothing ever removes it.
- `ThemeSync` reads only `getStoredChoice()`, never `getStoredPreference()`, so it can never save the fallback.

**Security model**: unchanged. The theme is not sensitive; the account write stays behind the signed in check spec 0003 defines.

**Critical test scenarios**:
- Fresh visitor, device set to dark, no storage: page paints light with no flash, toggle shows Light, verifies **AC-1**, **AC-3**.
- Stored `dark`, reload: paints dark before first paint, verifies **AC-2**.
- Stored `system`, device flips to dark mid visit: page follows, verifies **AC-2**.
- Unreadable storage (access throws): page renders light with no error, verifies **AC-1**.
- First sign in with nothing stored and account null: no save request is made, account stays null, page stays light, verifies **AC-4**.
- Pick Light explicitly while signed in: storage holds `light` and the account becomes `LIGHT`, verifies **AC-4**.
- New device, account `DARK`, nothing stored: page turns dark, local storage becomes `dark`, and no save request is made, verifies **AC-5**.
- Two tabs, stored `dark`; clear storage in one: the other turns light, verifies **AC-7**.

## Build plan

1. [x] Add `DEFAULT_THEME = "light"` in `lib/theme.ts` and use it as the inline script fallback; use it in `getStoredPreference` and the `useThemePreference` server snapshot in `lib/theme-client.ts`; render `data-theme-pref="light"` in `app/layout.tsx`, satisfies **AC-1**, **AC-2**, **AC-3**
2. [ ] Tighten the constant: type `DEFAULT_THEME` as `Exclude<ThemePreference, "system">` and render both `data-theme` and `data-theme-pref` from it in `app/layout.tsx`, satisfies **AC-1**
3. [ ] Fix the broken e2e test "system preference follows the device setting" in `tests/e2e/design-system.spec.ts`: call `usePreference(page, "system")` first (it relied on the old default), satisfies **AC-2**
4. [ ] In `lib/theme-client.ts`: add `getStoredChoice()` and rebuild `getStoredPreference()` on it; make the storage listener react to a `null` key as well as `aurevia-theme`, satisfies **AC-4**, **AC-7**
5. [ ] Add e2e tests: no storage plus `colorScheme: "dark"` paints light; storage that throws paints light; clearing storage in a second tab turns the first light, satisfies **AC-1**, **AC-7**
6. [ ] With spec 0003's account sync (its build plan task 6): `adoptPreference()`, and `ThemeSync` following the *Sync reconciliation* table; test the explicit Light save and the new device adopt, satisfies **AC-4**, **AC-5**, **AC-6**

## Consequences

**Positive**:
- Every first visit shows the light brand design.
- The account keeps an honest record of who chose what, so the default can change again without a data migration.
- No new code paths: the change is one constant and its three uses.

**Negative / tradeoffs**:
- Visitors on dark devices who never touched the toggle now see light; some will find it bright at night and have to pick Dark once.
- This departs from the platform convention of following the device setting.
- `ThemeSync` (when built) must read `getStoredChoice()` instead of the store's fallback, a small extra rule to remember.
- No one can return to "no choice" once they use the toggle, so a later change of default only reaches people who never touched it.
- The existing "system follows the device" e2e test breaks until build plan task 3 lands.

**Neutral**:
- Spec 0003, AC-3, AC-5, its Value sourcing row for the inline script, and its unreadable storage test scenario are amended to point here. `design.md`'s Theme section still describes the old default and needs a one line update.

## Follow-up

- [ ] Update `design.md`, *Theme*: "With nothing saved, the site starts in light." (via `/sync`)
- [ ] Build plan task 6 lands with spec 0003's account sync (its task 6); tasks 2 to 5 are small and can go in one `/develop` run.
