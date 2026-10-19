# 0013 · Saved homes

**Status**: Assumed
**Date**: 2026-10-19
**Authorized by**: Joy Shadmane, during /develop

## Owed decision
How hearts know what a visitor saved on public pages that must stay cached and never read the session (root `AGENTS.md`), where hearts appear, what the saved list shows for homes that are no longer available, and how saved homes appear in the chat. Spec 0002 already defines the `saved_homes` table and spec 0003 the `FavoriteButton` and the `/saved` account link.

## Assumption built on
- **Data** (spec 0002): migration `saved_homes`, primary key `(user_id, listing_id)`, `user_id` → `profiles` on delete cascade, `listing_id` → `listings` on delete restrict, `created_at`, index `(listing_id)`, row level security with no policies plus the guarded revokes. Additive only (spec 0002, AC-12). A visitor may save at most 200 homes.
- **Hearts on cached pages**: pages render without saved state. After hydration, one shared client store asks `savedListingIdsAction()` once per page load (signed out → empty) and fills every heart. Toggling calls `saveHomeAction({ listingId, saved })`, updates the heart at once (optimistic), and reverts with a toast on failure. Signed out, pressing a heart goes to `/sign-in?next=<current path>`; nothing is saved automatically after sign in.
- **Where hearts appear**: property cards in search (spec 0010), the homepage (spec 0012), similar homes (spec 0009), chat result cards (spec 0006), and beside Share on the property page (spec 0009). Only PUBLISHED listings can be saved; a saved home that later leaves PUBLISHED stays saved.
- **`/saved`** (signed in, `requireUser`): newest saved first, 24 per page with "Show more". Available homes as cards with hearts; homes no longer PUBLISHED as a short row "<title> · No longer available" with Remove. Empty state with "Browse homes" and "Ask the assistant". The header account menu's "Saved homes" link goes live.
- **Chat**: the assistant page's left pane gets two tabs, Conversations and Saved; Saved lists the visitor's saved available homes (title, area, price) linking to their pages, newest first, up to 20, refreshed when a heart in the chat changes.
- **Agents**: may save too (no difference in behavior).

## Code area
`prisma/schema.prisma`, `prisma/migrations/*_saved_homes`, `lib/server/saved-homes.ts`, `app/saved/`, `components/listing/save-heart.tsx`, `components/listing/saved-store.ts`, the card call sites, `components/assistant/`, `tests/db/saved-homes.test.ts`

## Requirements
- A signed in visitor can save and unsave a listing and see a saved homes list (scope, Done when).

## Ratify
This decision was recorded by /develop, not deliberated. Run `/architect saved homes`
to deliberate and ratify it. Until then it stays flagged as an owed decision; it does not block marking the feature `done`.
