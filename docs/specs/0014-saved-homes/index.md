# 0014 · Saved homes

**Status**: Assumed
**Date**: 2026-10-26
**Authorized by**: joyshadman, during /develop ("use recommended")

## Owed decision
Where saved homes are stored, who can save, how a heart on a public (cached, cookie free) page learns whether a home is saved, and what the saved list shows.

## Assumption built on
- **Data**: a new table `saved_homes (profile_id, listing_id, created_at)`, primary key `(profile_id, listing_id)`, both foreign keys `ON DELETE CASCADE`, index on `(profile_id, created_at desc)`. Saving twice is a no op (`ON CONFLICT DO NOTHING`).
- **Who**: any signed in user. Signed out, a heart sends the visitor to `/sign-in?next=<this page>`; nothing is saved until they come back and press it again.
- **Public pages stay cacheable**: hearts are client components. One provider in the root layout asks a server action for the user's saved listing ids once, the first time a heart shows on a page. Toggling calls `saveHome` or `unsaveHome` and updates the heart at once, rolling back on failure. Pages themselves still read no cookies.
- **Where hearts appear**: listing cards on `/properties`, the homepage, and similar homes; the property page header; and listing cards in the assistant chat.
- **The list**: `/saved` (signed in only, `requireUser`), newest saved first, as property cards linking to their pages. A saved home that is no longer published shows as "No longer available" with a Remove button. Empty state links to `/properties` and the assistant. The account menu's "Saved homes" entry goes live.
- **Only published homes can be saved** (the action checks); unsaving always works.

## Code area
`prisma/schema.prisma`, `prisma/migrations/20261026120000_saved_homes/`, `lib/server/saved-homes.ts`, `app/saved/` (page, actions, `save-home.tsx` provider and button), `components/listing/property-card.tsx` (`save` slot), `app/layout.tsx`, the card call sites, `lib/nav.ts`

## Requirements
- **AC-1**: a signed in user can save and unsave a home from a card, the property page, or a chat card; the heart shows the saved state on every page.
- **AC-2**: signed out, pressing a heart goes to sign in and returns to the page.
- **AC-3**: `/saved` lists saved homes, newest first, and handles unpublished ones and the empty state.
- **AC-4**: public pages still read no cookies and stay cached.
- **AC-5**: deleting a user or a listing removes their saved rows.

## Ratify
This decision was recorded by /develop, not deliberated. Run `/architect saved homes` to deliberate and ratify it. Until then it stays flagged as an owed decision; it does not block marking the feature `done`.
