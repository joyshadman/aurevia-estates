# Verify: agent listing management · spec 0005 · updated 2026-10-19
_Steps derived from spec 0005 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

The UI steps need a signed in agent, so they wait for feature 5 (sign in). The commands run today.

## UI / manual
- [ ] As an agent, open `/dashboard/listings` → table shows Property, Area, Price, Status, Open leads, Advisor; "Mine only" is on → AC-1
- [ ] Turn "Mine only" off → colleagues' listings appear; search `aur-1001` → only AUR-1001 → AC-1
- [ ] Open the Drafts tab with no drafts → empty state with a New listing button → AC-1
- [ ] New listing with a 4 character title → refused; with "Garden view apartment", Apartment, Uposhohor → lands on the edit page as a Draft with a new `AUR-` code → AC-2
- [ ] On the draft, the checklist lists price, address, location, description, photo, cover, and the apartment fields; Publish is disabled → AC-5
- [ ] Change the type to Plot with bedrooms entered → warning names bedrooms; Save → bedrooms empty after reload → AC-3
- [ ] Type `12,500,000` in Price → hint shows `BDT 12,500,000`; type `12.5` and Save → "Whole taka only" → AC-6
- [ ] Paste `24.8949, 91.8687` and Find → point shown with "Open in Google Maps"; paste a `maps.app.goo.gl` link → resolves; paste `28.6139, 77.209` → "outside Bangladesh" → AC-7
- [ ] Add an Unsplash photo link → it becomes the cover; add a second, move it up, make it the cover, edit its alt text, remove the first → AC-8
- [ ] Add an `http://` link, a Facebook image link, and the same link twice → each refused with its message → AC-8
- [ ] Tick two amenities, Save, reload → both ticked → AC-9
- [ ] Fill everything, type a new description without saving, press Publish → Published, and the new description is saved → AC-5
- [ ] On the published listing, clear the address and Save → "To publish, add: Address line", nothing saved → AC-4
- [ ] Unpublish → leaves search; Publish again → back; Mark sold → form read only; a draft's Delete removes it → AC-10
- [ ] Hand over to a colleague with two open leads → toast says 2 open leads; the leads show a SYSTEM note → AC-11
- [ ] Open a colleague's listing → read only, with a note naming who to contact → AC-12
- [ ] Two tabs on one listing: save in B, add a photo in A → stale banner; Save in A → refused as stale → AC-13
- [ ] Description keeps blank line paragraphs as plain text; 3,001 characters can't be typed → AC-14
- [ ] Signed out, `/dashboard/listings` → `/sign-in?next=%2Fdashboard%2Flistings`; as a visitor → 404 page → AC-15

## Commands
- [ ] `npm run test:db` → `tests/db/agent-listings.test.ts` and `tests/db/dashboard-gate.test.ts` pass → AC-1 to AC-15
- [ ] `npm run db:drift` (with `SHADOW_DATABASE_URL`) → "No difference detected" → data model
- [ ] `npm run build` → `/dashboard/listings*` build as partial prerenders with no blocking route errors → AC-15

## Value sourcing checks
- [ ] Open leads: create NEW, CONTACTED, and WON leads on one listing → column shows 2
- [ ] Advisor: an agent with no full name shows the part of the email before the @; an unassigned listing shows "Unassigned"
- [ ] Page cursor: page through 30 listings with no edits → each appears once
- [ ] Mine only: a listing assigned to you that a colleague created appears with Mine only on
- [ ] createDraft: ref and slug come from `listing_ref_seq` (next free `AUR-` number); creator and advisor are you
- [ ] Effective type: save a Plot draft with `bedrooms` but no type → bedrooms cleared
- [ ] Conflict token: the token returned by an action is the row's `updated_at` to the millisecond, so your next save succeeds
- [ ] canEdit: creator or assignee, not SOLD; a former assignee who didn't create it is read only
- [ ] Photo cover: the first photo becomes the cover; removing a draft's cover moves it to the next photo
- [ ] Reassign activity text uses full names, or the email prefix when a name is empty

## Acceptance-criteria coverage
- AC-1 table steps, `listAgencyListings` test · AC-2 new listing step, create tests · AC-3 type change step and tests · AC-4 published save step and tests · AC-5 checklist and publish steps, race test · AC-6 price step and tests · AC-7 location step and tests · AC-8 photo steps and tests · AC-9 amenities step and test · AC-10 lifecycle step and tests · AC-11 hand over step and test · AC-12 read only step and rights tests · AC-13 two tab step and conflict test · AC-14 description step and tests · AC-15 gate step and `dashboard-gate.test.ts`
