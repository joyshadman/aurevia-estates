# Verify: Agent listing management · spec 0005 · updated 2026-10-21
_Steps derived from spec 0005 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Before you start: fill `DATABASE_URL` and `DIRECT_URL` in `.env.local`, run `npm run db:deploy` (applies `20261021120000_listing_drafts`), then `npm run db:seed -- --sample`. You need two agent accounts (promote with `npm run agent:promote`, spec 0004) with fresh authenticator codes.

## UI / manual

### Create and publish (AC-2, AC-5, AC-15)
- [ ] `/dashboard/listings` → New listing → title "Test flat", Apartment, an area → lands on the edit page; the row has `created_by_id` and `assigned_agent_id` set to you, a fresh `AUR-` ref and slug, status DRAFT → AC-2
- [ ] Title of 4 characters is refused; 5 to 120 is accepted → AC-2
- [ ] Save with only title, type, and area → succeeds; price, address, description stay null; the checklist lists everything else; Publish is disabled → AC-2, AC-4, AC-5
- [ ] Fill the apartment fields, price, address, coordinates, a 60 character description, add an Unsplash photo → every checklist item ticks live and Publish turns on → AC-5
- [ ] Type a new description and press Publish without saving → the description is saved and the listing is PUBLISHED in one step → AC-5
- [ ] `searchPublishedListings` (or the assistant) now returns the listing → AC-5
- [ ] As a signed in visitor, `/dashboard/listings` is a 404, and calling any action returns `{ ok: false, reason: "not_found" }` → AC-15

### Form rules (AC-3, AC-4, AC-6, AC-9, AC-14)
- [ ] An apartment with a floor number: switch the type to Plot → the hint says saving will clear the entered fields; after Save they are null → AC-3
- [ ] Completion status Ready with a handover date set earlier → saving clears the handover date → AC-3
- [ ] On a PUBLISHED listing, clear the address and Save → refused with "To publish, add: Address"; nothing written → AC-4
- [ ] Price `12,500,000` saves as 12500000 and previews `BDT 12,500,000`; `0` and `12.5` are refused → AC-6
- [ ] Save without touching amenities → they stay; tick two and save → exactly those two remain → AC-9
- [ ] A description of 3,001 characters can't be typed or saved; publishing with 49 characters is blocked → AC-14

### Location (AC-7)
- [ ] `24.8949, 91.8687`, a long Maps link with `!3d…!4d…`, a long link with `@lat,lng`, and a `maps.app.goo.gl` short link all resolve to 6 decimals, with a working "Open in Google Maps" link → AC-7
- [ ] London coordinates → "That location is outside Bangladesh."; an OpenStreetMap link → `location_unreadable` → AC-7
- [ ] Call `saveListing` directly with latitude 22.5, longitude 87.9 → refused (`invalid`, latitude) → AC-7

### Photos (AC-8)
- [ ] A Drive share link (file shared with anyone with the link) converts to `lh3.googleusercontent.com/d/<id>=w2000` and saves; a private Drive file → `drive_not_shared` → AC-8
- [ ] Refused: an `http` link, a host off the list, a Cloudinary `/image/fetch/` link, a PDF, an image over 15 MB, a deleted Imgur image → each with its message → AC-8
- [ ] The 21st photo → `photo_limit`; the same link twice → `duplicate` → AC-8
- [ ] Move photos up and down, set another cover, edit alt text (saves on leaving the field) → order, cover, and alt persist after reload → AC-8
- [ ] Remove the cover of a draft → the next photo becomes the cover; the cover's remove button is disabled on a published listing, and calling `removePhoto` directly returns `last_cover` → AC-8

### Lifecycle and reassign (AC-10, AC-11)
- [ ] Unpublish (confirm dialog) → leaves search and the assistant at once; Publish again works with the same checks → AC-10
- [ ] Mark sold → the form becomes read only with the sold note → AC-10
- [ ] Delete draft → gone, back on the list; `deleteDraft` on an UNPUBLISHED listing → `not_deletable` → AC-10
- [ ] Reassign to agent B with two open leads and one WON lead on the listing → the two open leads move to B, each with a SYSTEM activity "Reassigned from A to B with the listing"; the WON lead stays; a `listing.reassigned` Sentry event → AC-11
- [ ] After that, B can edit; A (if not the creator) sees the read only note; choosing the current agent changes nothing → AC-11, AC-12

### Rights and conflicts (AC-12, AC-13)
- [ ] Agent B opens agent A's listing → read only, with the note naming who to contact; calling `saveListing` directly → `forbidden`, nothing written → AC-12
- [ ] Two tabs on one listing: tab 2 saves; tab 1 adds a photo → it applies and the stale banner shows; tab 1 then saves → refused with `stale` → AC-13
- [ ] In one tab: add a photo, then save → no conflict → AC-13

### List page (AC-1)
- [ ] Columns Property (title, ref, type), Area, Price (blank for a draft without one), Status, Open leads, Advisor ("Unassigned" when none) → AC-1
- [ ] Tabs All, Published, Unpublished, Drafts, Sold filter by status; "Mine only" is on by default and the toggle shows the whole agency → AC-1
- [ ] Search `aur-1042` finds `AUR-1042`; part of a title in any case finds it → AC-1
- [ ] With 30 listings and no edits in between, page 1 shows 25 and Next page shows the other 5, each listing once → AC-1
- [ ] A search with no results shows the empty state with New listing → AC-1

## Commands
- [ ] `npm run db:deploy` then check the live schema: `price_bdt`, `address_line`, `description` are nullable; `updated_at` default is `date_trunc('milliseconds'::text, now())` → data model
- [ ] A raw `UPDATE listings SET price_bdt = NULL WHERE status = 'PUBLISHED'` fails `listings_published_complete_ck` → AC-5
- [ ] `npm run db:drift` (with `SHADOW_DATABASE_URL`) reports no drift → data model
- [ ] `npm run test:e2e` → "every dashboard page imports requireAgent" passes (passed 2026-10-21) → AC-15
- [ ] `npm run typecheck`, `npm run lint`, `npm run build` pass (passed 2026-10-21)

## Value sourcing
- [ ] Open lead count counts only NEW, CONTACTED, QUALIFIED (add a WON lead; the number doesn't change)
- [ ] Advisor shows `full_name`, else the part of the email before @, else "Unassigned"
- [ ] Price column goes through `formatPrice`; blank when null
- [ ] Page cursor is keyset on `(updated_at desc, id desc)`: editing a listing between pages moves it to page 1, never duplicates it within a page walk without edits
- [ ] "Mine only" means created by you or assigned to you (a listing you created but reassigned still shows)
- [ ] `ref_code` and `slug` come from `nextListingRef` (refs are sequential across drafts)
- [ ] Effective type: saving `bedrooms` on a PLOT draft without `propertyType` clears it
- [ ] Conflict token: the form's `expectedUpdatedAt` matches `listings.updated_at` to the millisecond after every action
- [ ] Which fields show follows the type rules table (Plot hides bedrooms, bathrooms, size, floor, completion)
- [ ] `canEdit` is creator or assignee and not SOLD
- [ ] Checklist uses form state live, and the server reruns it on the saved result
- [ ] Stored photo URL is the normalized one (a Drive link stores the `lh3` form)
- [ ] `sort_order` is max + 1; the first photo is the cover
- [ ] Reassign choices come from `listActiveAgents()` (a deleted or demoted agent doesn't appear)
- [ ] Activity text uses each agent's name, or the email before @

## Acceptance-criteria coverage
- AC-1: List page steps · AC-2: Create steps 1 to 3 · AC-3: Form rules steps 1, 2 · AC-4: Create step 3, Form rules step 3 · AC-5: Create steps 3 to 6, raw update command · AC-6: Form rules step 4 · AC-7: Location steps · AC-8: Photo steps · AC-9: Form rules step 5 · AC-10: Lifecycle steps 1 to 3 · AC-11: Lifecycle steps 4, 5 · AC-12: Rights step 1, Lifecycle step 5 · AC-13: Rights steps 2, 3 · AC-14: Form rules step 6 · AC-15: Create step 7, e2e command

## Open questions for /architect
- The spec's test scenarios say Kolkata must be refused, but Kolkata (22.57, 88.36) sits inside the AC-7 bounding box (latitude 20.5 to 26.7, longitude 88.0 to 92.7). The build follows AC-7's numbers, so Kolkata is accepted. A bounding box can't separate them; this needs a different rule (for example a Bangladesh outline) or a corrected test.
