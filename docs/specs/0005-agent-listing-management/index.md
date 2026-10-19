# 0005. Agent listing management

**Date**: 2026-10-17
**Status**: In Progress

## Summary

Agents get a listings area in the dashboard: a searchable table of every agency listing, and one form per listing to fill in details, location, amenities, photo links, and a description. A listing can be saved as a draft with only a title, type, and area; Publish (which also saves) turns on once a checklist of required fields is complete, and only published listings reach the assistant and public pages. Agents see every listing but edit only their own or assigned ones, edits to published listings go live on save, and two agents saving at once never silently overwrite each other. A small migration lets drafts leave price, address, and description empty.

## Requirements

**User stories**:
- As an agent, I want to create a listing quickly and finish it later, so I can start before I have every detail.
- As an agent, I want a clear list of what's missing before I can publish, so I don't guess.
- As an agent, I want to paste a Google Maps link instead of typing coordinates.
- As an agent, I want to add photo links, reorder them, and pick the cover.
- As an agent, I want to unpublish, mark sold, or hand a listing (and its open buyers) to a colleague.
- As an agent, I want to see the whole agency's listings so I can answer buyers about a colleague's home.
- As a buyer (through the assistant), I want to see only real, published, complete listings.

**Acceptance criteria**:
- **AC-1**: `/dashboard/listings` lists every listing in the agency (any agent's), 25 per page, newest updated first, with columns Property (title, `ref_code`, type), Area, Price (blank for a draft without one), Status, Open leads, Advisor (assigned agent's name, or "Unassigned"), and tabs All, Published, Unpublished, Drafts, Sold. "Mine only" (on by default) limits it to listings the agent created or is assigned to. Search matches the title (case insensitive, contains) or an exact `ref_code` (`aur-1042` matches `AUR-1042`). Empty results show an empty state with a "New listing" action.
- **AC-2**: "New listing" asks for title (5 to 120 characters), property type, and area, creates a DRAFT with `created_by_id` and `assigned_agent_id` set to the agent and the `ref_code` and `slug` from `nextListingRef`, and opens its edit page. Price, address line, and description may stay empty on a draft.
- **AC-3**: The edit page shows the fields that apply to the listing's property type (spec 0002 type rules table) and hides the ones that must be empty. Changing the type warns which entered values will be cleared, and saving clears them. `handover_date` is cleared whenever `completion_status` is not UNDER_CONSTRUCTION.
- **AC-4**: Saving a DRAFT or UNPUBLISHED listing accepts any subset of fields that are individually valid (omitted fields stay unchanged; `null` clears a field); saving a PUBLISHED listing requires everything Publish requires (AC-5) and refuses otherwise, listing what is missing. A saved PUBLISHED listing's changes appear on its public data at once (the next request after save).
- **AC-5**: A checklist on the edit page shows, live from the form, what Publish needs: the type's required fields, price, address line, coordinates, description (50 to 3,000 characters), at least one photo with a cover. Publish is enabled when every item is met; it saves the form's current values and publishes in one transaction (with the conflict check, AC-13), and the server rechecks everything against the saved result under a row lock, so a photo removed at the same moment can't produce a listing without a cover.
- **AC-6**: Price is entered in whole taka (commas allowed), must be 1 to 10,000,000,000, and shows a live preview in the spec 0003 format (`BDT 12,500,000`).
- **AC-7**: Location: the agent pastes coordinates (`24.8949, 91.8687`), a full Google Maps link, or a short Google Maps link (`maps.app.goo.gl/...`); the server returns latitude and longitude to 6 decimals, or a message asking for plain coordinates. Coordinates outside Bangladesh (latitude 20.5 to 26.7, longitude 88.0 to 92.7) are refused, both here and in every save. The form shows the result with an "Open in Google Maps" link to check it.
- **AC-8**: Photos: the agent adds a photo by link from `images.unsplash.com`, `i.imgur.com`, `res.cloudinary.com` (uploaded images only, not its `/image/fetch/` proxy), or Google Drive (`drive.google.com` share links, converted to `lh3.googleusercontent.com/d/<id>=w2000`; the file must be shared with anyone with the link). The server checks the link answers with status 200 or 206 within 3 seconds in total, with an image type (`jpeg`, `png`, `webp`, `avif`), under 15 MB when the size is known, and is not Imgur's "removed" placeholder; otherwise the photo is refused with the reason. A listing holds at most 20 photos and no duplicate links. The first photo becomes the cover. The agent can move photos up or down, set any photo as cover, edit alt text (up to 160 characters), and remove a photo; the cover of a PUBLISHED listing cannot be removed (spec 0002 `LastCoverError`).
- **AC-9**: Amenities: the agent ticks any number of active amenities from the seeded list; saving with an amenity list replaces the listing's set, and saving without one leaves it alone.
- **AC-10**: Lifecycle actions, each with a confirm dialog: Unpublish (PUBLISHED → UNPUBLISHED), Publish again (UNPUBLISHED → PUBLISHED, same checks), Mark sold (PUBLISHED or UNPUBLISHED → SOLD; the form then becomes read only), Delete (DRAFT only; removes the listing, its photos, and amenities). Unpublish and Mark sold remove the listing from search, the assistant, and the sitemap at once. A SOLD listing's public page stays reachable with a Sold badge and no booking; DRAFT and UNPUBLISHED pages are 404.
- **AC-11**: Reassign: the listing's creator or current assigned agent can choose another active agent (role AGENT, `deleted_at` null) as the assigned agent. In the same transaction, the listing's open leads (NEW, CONTACTED, QUALIFIED) move to the new agent, each with a SYSTEM `lead_activities` row ("Reassigned from <old> to <new> with the listing"). Choosing the current agent changes nothing. The change is reported to Sentry.
- **AC-12**: Editing rights: only the listing's creator or assigned agent can save, publish, change status, manage photos, or reassign. Other agents open the listing read only, with a note saying who to contact. Every action rechecks this on the server, using the same rule as spec 0002's `setCover`, `deletePhoto`, and `transitionListing`; a refused action returns `{ ok: false, reason: "forbidden" }` and changes nothing.
- **AC-13**: Conflicts: every action on a listing (save, publish, status changes, photo actions, reassign) sends the `updatedAt` the form holds. A field save or publish whose token is out of date is refused with the `stale` message and nothing is written. A photo, status, or reassign action whose token is out of date still applies (it doesn't touch the form's fields) but returns `formStale: true`, and the form shows the `stale` message instead of adopting a new token. Otherwise every action returns the listing's new `updatedAt`, which the form keeps, so an agent's own actions never conflict with their next save.
- **AC-14**: Description is plain text: blank lines separate paragraphs, nothing else is interpreted. Drafts accept up to 3,000 characters; publishing needs 50 to 3,000.
- **AC-15**: All pages and actions in this feature are agent only (spec 0004 `requireAgent()` and `requireAgentAction()`).

## Decision

**Chosen option**: Option 1: dashboard pages with server actions over spec 0002's listing domain, partial drafts (with a small migration) and a live publish checklist, save and publish in one locked transaction, pasted photo links from four allowed hosts checked on the server, Google Maps link parsing, optimistic conflict checks on `updated_at`, and `updateTag` for instant public updates.

**Implementation skills**: `prisma-client-api` (`prisma/skills`, `.claude/skills/prisma-client-api/`) · `supabase-postgres-best-practices` (`supabase/agent-skills`, `.claude/skills/supabase-postgres-best-practices/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

### Data model

One additive migration, `listing_drafts`, changing spec 0002's `listings` table:

| Change | Detail |
|---|---|
| `price_bdt` nullable | keeps `check (price_bdt > 0)`, which passes for null |
| `address_line` nullable | |
| `description` nullable | |
| `listings_published_complete_ck` replaced | `status <> 'PUBLISHED' or (latitude is not null and longitude is not null and published_at is not null and assigned_agent_id is not null and price_bdt is not null and address_line is not null and description is not null)` |
| `updated_at` default | `date_trunc('milliseconds', now())`, so a database default never stores microseconds the conflict check can't match |

`searchPublishedListings`, `serializeListing`, and `ListingCardDTO` (specs 0002, 0003) only ever see PUBLISHED rows, where these are guaranteed present; `serializeListing` types them as non null after asserting the status. This feature also changes spec 0002's security model: agents may **read** every listing in any status; editing stays limited to the creator and assigned agent. And it adds one exception to 0002's "listings are never hard deleted": a DRAFT may be deleted (no transition leads back to DRAFT, so a DRAFT was never published).

Every write to a listing row sets `updated_at` to an app side millisecond `Date` through one helper, `touchListing(tx, id, expectedUpdatedAt)` in `lib/server/agent-listings.ts`, which runs `updateMany({ where: { id, updatedAt: expectedUpdatedAt }, data: { updatedAt: new Date() } })` and returns `{ updatedAt, matched: boolean }`.

### State transitions

Unchanged from spec 0002, exposed through these actions: DRAFT → PUBLISHED (`publish`), PUBLISHED → UNPUBLISHED (`unpublish`), UNPUBLISHED → PUBLISHED (`publish`), PUBLISHED or UNPUBLISHED → SOLD (`markSold`). SOLD is terminal and read only. Only a DRAFT can be deleted. Seller statuses (PENDING_REVIEW and onward) belong to features 23 and 24 and show only on the All tab.

The "AGENT owner" rule in spec 0002's `setCover`, `deletePhoto`, and listing transitions is defined here as `canEditListing`: the actor is the listing's `created_by_id` or `assigned_agent_id`. A former assignee who is not the creator loses rights on reassignment.

### Pages

| Path | Shows |
|---|---|
| `/dashboard/listings` | the table in AC-1; query params `tab`, `q`, `mine` (`1` or `0`), `cursor`; New listing button |
| `/dashboard/listings/new` | title, type, area form (AC-2) |
| `/dashboard/listings/[id]` | the edit page: sections Basics (title, type, area, address line, price, negotiable), Details (type fields), Location, Amenities, Photos, Description; a side panel with status badge, `ref_code`, assigned agent, the publish checklist, and the actions (Save, Publish, Unpublish, Mark sold, Delete, Reassign); read only for agents without editing rights |

Each page calls `requireAgent()` (spec 0004) and renders inside the dashboard shell from the admin mockup (sidebar with Overview, Properties, Leads; only Properties and Leads are live in slice 1), built from spec 0003 components.

### API surface

Server actions in `app/dashboard/listings/actions.ts`. Each calls `requireAgentAction()` first, validates with Zod, runs in an interactive Prisma transaction (`prisma.$transaction(async (tx) => ...)`) that first locks the listing row (`select id from listings where id = $1 for update` via `tx.$queryRaw`), checks `canEditListing`, and returns `{ ok: true, updatedAt, formStale?: true, ... } | { ok: false, reason, missing? }`.

| Action | Inputs | Output | Key errors (reason) |
|---|---|---|---|
| `createDraft` | `title`, `propertyType`, `areaId` | `{ id }`, then redirect to the edit page | `invalid` |
| `saveListing` | `id`, `expectedUpdatedAt`, `fields` (any of: `title`, `propertyType`, `areaId`, `addressLine`, `priceBdt`, `priceNegotiable`, `bedrooms`, `bathrooms`, `builtUpSqft`, `landKatha`, `floorNumber`, `totalFloors`, `parkingSpaces`, `completionStatus`, `handoverDate`, `latitude`, `longitude`, `description`, `amenityIds`) | `{ updatedAt }` | `forbidden`, `stale`, `invalid` (per field), `incomplete` (published listing, with `missing`) |
| `publish` | `id`, `expectedUpdatedAt`, `fields` (the form's current values, as in `saveListing`) | `{ updatedAt }` | `forbidden`, `stale`, `invalid`, `incomplete` (with `missing`), `stale_status` |
| `resolveLocation` | `input` (text) | `{ latitude, longitude }` | `location_unreadable`, `outside_bangladesh` |
| `addPhoto` | `listingId`, `expectedUpdatedAt`, `url`, `alt?` | `{ photo, updatedAt }` | `forbidden`, `host_not_allowed`, `redirect_not_allowed`, `not_an_image`, `too_large`, `unreachable`, `drive_not_shared`, `image_removed`, `duplicate`, `photo_limit` |
| `movePhoto` | `photoId`, `expectedUpdatedAt`, `direction: "up" \| "down"` | `{ updatedAt }` | `forbidden` |
| `setCoverPhoto` | `photoId`, `expectedUpdatedAt` | `{ updatedAt }` | `forbidden` |
| `updatePhotoAlt` | `photoId`, `expectedUpdatedAt`, `alt` | `{ updatedAt }` | `forbidden`, `invalid` |
| `removePhoto` | `photoId`, `expectedUpdatedAt` | `{ updatedAt }` | `forbidden`, `last_cover` |
| `unpublish` | `id`, `expectedUpdatedAt` | `{ updatedAt }` | `forbidden`, `stale_status` |
| `markSold` | `id`, `expectedUpdatedAt` | `{ updatedAt }` | `forbidden`, `stale_status` |
| `deleteDraft` | `id` | redirect to the list | `forbidden`, `not_deletable` |
| `reassign` | `id`, `expectedUpdatedAt`, `agentId` | `{ updatedAt, movedLeads }` | `forbidden`, `invalid_agent` |

**Save** (`saveListing`, and the save part of `publish`), inside the transaction:
1. Lock and load the listing; check `canEditListing`.
2. Merge: stored values, overlaid by `fields` (a key absent means unchanged; `null` clears it). The effective type is `fields.propertyType` if present, else the stored one.
3. Normalize: set the effective type's must be empty fields to null; set `handoverDate` to null unless `completionStatus` is UNDER_CONSTRUCTION; round `latitude` and `longitude` to 6 decimals and refuse outside the Bangladesh bounds.
4. Validate the merged result with `listingDraftInput` (spec 0002's `listingInput` with every field optional, same per field rules, against the effective type). If the listing is PUBLISHED, or the action is `publish`, also validate with the full `listingInput` and `publishChecklist` (photos read inside the same transaction); failures return `incomplete` with `missing`.
5. `touchListing(tx, id, expectedUpdatedAt)`; if `matched` is false, throw so the transaction rolls back and return `stale`.
6. Update the listing columns; if `fields.amenityIds` is present, `deleteMany` then `createMany` on `listing_amenities`.
7. For `publish`, call `publishListing` (spec 0002) with this `tx`; it runs `transitionListing`, whose status guard returns `stale_status` on a race.

**Photo, status, and reassign actions**: lock the listing row, check `canEditListing`, perform the change (spec 0002's `setCover` and `deletePhoto` take the `tx`), then `touchListing(tx, id, expectedUpdatedAt)`. If `matched` is false, set `updatedAt = new Date()` without the condition and return `formStale: true` (the action still applies). Photo actions on a PUBLISHED listing hold the same row lock as `publish`, so the checklist and the photos can't change under each other.

**Reassign**: refuse an `agentId` that isn't role AGENT with `deleted_at` null (`invalid_agent`); return early with no change when it equals the current assignee. Otherwise update `assigned_agent_id`, update open leads for that listing to the new agent, and insert one SYSTEM activity per moved lead, in the same transaction.

**Delete** (`deleteDraft`): lock, check `canEditListing` and `status = DRAFT`, delete photos, amenities, and the listing. A foreign key error (`P2003`, for example a recommendation pointing at it) returns `not_deletable` and rolls back.

**Server reads** in `lib/server/agent-listings.ts`:

| Function | Inputs | Output |
|---|---|---|
| `listAgencyListings({ tab, q, mine, cursor, agentId })` | as in AC-1 | rows with title, `refCode`, type, area name, `priceBdt` (or null), status, open lead count, Advisor name, `updatedAt`; `nextCursor` |
| `getListingForEdit(id, agent)` | listing id | full listing, photos (by `sort_order`), amenity ids, `canEdit`, `publishChecklist` |
| `listActiveAgents()` | none | `{ id, fullName }[]` of role AGENT, `deleted_at` null |

**Publish checklist** (`lib/domain/publish-checklist.ts`, pure, used by the page on form state and by the server on the merged result): the type's required fields (spec 0002), `priceBdt`, `addressLine`, `latitude` and `longitude`, description length 50 to 3,000, at least one photo and a cover. Returns `{ complete, missing: string[] }`, where each entry is a field label.

**Cache**: public listing reads (features 10, 11, 12) are cached with `cacheTag("listings")` and `cacheTag("listing:<id>")`. After any change to a listing whose status is or was PUBLISHED (save, photo change, publish, unpublish, mark sold, reassign), the action calls `updateTag("listing:<id>")` and `updateTag("listings")` after the transaction commits. Draft only changes call neither. `searchPublishedListings` (the assistant's search) reads the database directly and is not cached. Public page rule for feature 10: PUBLISHED shows normally; SOLD shows with a Sold badge, no booking, `noindex` excluded from the sitemap; DRAFT and UNPUBLISHED return 404.

### Photo links

`lib/server/photo-links.ts`, `normalizePhotoUrl(input)` then `checkPhotoUrl(url)`:

1. Parse as a URL; require `https`.
2. Google Drive: from `drive.google.com/file/d/<id>/...`, `drive.google.com/open?id=<id>`, or `drive.google.com/uc?id=<id>`, build `https://lh3.googleusercontent.com/d/<id>=w2000`.
3. The host (after step 2) must equal one of `images.unsplash.com`, `i.imgur.com`, `res.cloudinary.com`, `lh3.googleusercontent.com` exactly (no suffix matching); else `host_not_allowed`. For Cloudinary, the path must contain `/image/upload/` and must not contain `/image/fetch/` or an embedded `http`; else `host_not_allowed`.
4. Fetch with method `GET`, header `Range: bytes=0-0`, `redirect: "manual"`, no cookies, 3 seconds in total across all hops (one `AbortSignal.timeout(3000)`). Follow at most 2 redirects: resolve a relative `Location` against the current URL, require `https` and an allowed host (else `redirect_not_allowed`, or `drive_not_shared` for a Drive link, whose private files redirect to Google sign in).
5. Require status 200 or 206 (else `unreachable`, or `drive_not_shared` for Drive). Read `content-type` (must be `image/jpeg`, `image/png`, `image/webp`, or `image/avif`, else `not_an_image` or `drive_not_shared` for Drive) and the size from `content-range` or `content-length`; over 15 MB is `too_large`; an unknown size is accepted. Cancel the response body without reading it (`response.body?.cancel()`), in case the host ignored `Range`.
6. On `i.imgur.com`, a final path of `/removed.png` is `image_removed`.
7. Timeout or network error is `unreachable`. Store the normalized URL in `listing_photos.url`; `alt` defaults to the listing title (spec 0002).

`lib/images.ts` (spec 0003) adds `i.imgur.com` and `res.cloudinary.com` to `images.remotePatterns` (Cloudinary restricted to `/*/image/upload/**`), so every allowed host is optimized by `next/image`.

`addPhoto` runs, in its transaction, a count check (fewer than 20), a duplicate check on `(listing_id, url)`, and the insert with `sort_order` = current maximum + 1 and `is_cover` = true when it is the first photo. The link check runs before the transaction opens, so no row lock is held during the outbound request. `movePhoto` swaps `sort_order` with the neighbor. `removePhoto` on the cover of a non published listing makes the next photo by `sort_order` the cover.

### Location parsing

`lib/server/location.ts`, `resolveLocation(input)`:

1. Plain coordinates: two decimal numbers separated by a comma and optional spaces.
2. A Google Maps URL (host exactly `google.com`, `www.google.com`, or `maps.google.com`, path under `/maps`): take the first match of `!3d<lat>!4d<lng>`, then `@<lat>,<lng>`, then a `q`, `query`, or `ll` parameter holding `<lat>,<lng>`.
3. A short link (host `maps.app.goo.gl`, or `goo.gl` with path under `/maps`): follow redirects with `redirect: "manual"`, at most 5 hops, 3 seconds in total, no cookies. Each hop: resolve a relative `Location` against the current URL, require `https`, and require the host to equal `maps.app.goo.gl`, `goo.gl`, `google.com`, `www.google.com`, or `maps.google.com`. Stop on a non 3xx response and parse that URL as in step 2. A redirect to `consent.google.com` (Google's consent page for some server regions) ends as `location_unreadable`.
4. Round to 6 decimals; refuse outside latitude 20.5 to 26.7 and longitude 88.0 to 92.7.

Any failure returns `location_unreadable`, and the form suggests pasting the numbers from Google Maps (long press the pin on a phone).

### Error messages

| Reason | Message |
|---|---|
| `forbidden` | Only the listing's creator or assigned agent can change it. |
| `stale` | Someone else updated this listing. Reload to see their changes. |
| `stale_status` | This listing's status just changed. Reload to see it. |
| `invalid` | (per field, from Zod) |
| `incomplete` | To publish, add: (the `missing` list) |
| `location_unreadable` | We couldn't read a location from that. Paste the coordinates instead, like 24.8949, 91.8687. |
| `outside_bangladesh` | That location is outside Bangladesh. Check the link. |
| `host_not_allowed` | Use a photo link from Unsplash, Imgur, Cloudinary, or Google Drive. |
| `redirect_not_allowed` | That link redirects somewhere we don't accept. Use the direct image link. |
| `not_an_image` | That link isn't an image. Use the direct image link. |
| `drive_not_shared` | We can't open that Drive file. Share it with "Anyone with the link". |
| `image_removed` | That image was removed from Imgur. |
| `too_large` | That image is over 15 MB. |
| `unreachable` | We couldn't reach that link. Check it and try again. |
| `duplicate` | That photo is already on this listing. |
| `photo_limit` | A listing can have up to 20 photos. |
| `last_cover` | A published listing needs a cover. Pick another cover first. |
| `not_deletable` | Only drafts can be deleted. Unpublish it instead. |
| `invalid_agent` | Choose an active agent. |

### Value sourcing

| Action | Value produced / displayed | Source |
|---|---|---|
| List page | open lead count | `count(leads)` grouped by `listing_id` where status in NEW, CONTACTED, QUALIFIED |
| List page | Advisor | `profiles.full_name` of `assigned_agent_id`; the email before the @ when the name is empty; "Unassigned" when null |
| List page | price | `price_bdt` through `toTaka` and spec 0003 `formatPrice`; blank when null |
| List page | page cursor | keyset on `(updated_at desc, id desc)`, base64url `{ updatedAt, id }` |
| List page | "Mine only" set | `created_by_id = agent.id or assigned_agent_id = agent.id` |
| createDraft | `ref_code`, `slug` | `nextListingRef(title)` (spec 0002) |
| createDraft | creator and assigned agent | `requireAgentAction()` user id |
| saveListing, publish | effective type | `fields.propertyType`, else the stored `property_type` |
| saveListing, publish | cleared fields | spec 0002 type rules table ("must be empty"); `handover_date` rule |
| Every action | conflict token | `expectedUpdatedAt` from the form, against `listings.updated_at` via `touchListing` |
| Edit page | which fields show | spec 0002 type rules table, by `property_type` |
| Edit page | `canEdit` | `created_by_id` or `assigned_agent_id` equals the agent, and status not SOLD |
| Edit page | publish checklist | `publishChecklist(formState, photos)`; on the server, `publishChecklist(merged, photos)` |
| resolveLocation | coordinates | the pasted text, or the final URL after following a short link |
| addPhoto | stored URL | `normalizePhotoUrl` (Drive converted) |
| addPhoto | image type and size | the `Range` request's response headers |
| addPhoto | `sort_order`, `is_cover` | current max `sort_order` + 1; cover when the listing has no photos |
| Price preview | formatted price | spec 0003 `formatPrice` |
| Reassign | agent choices | `listActiveAgents()` |
| Reassign | activity text | old and new agents' `full_name` (email before the @ when empty) |
| Description display | paragraphs | split on blank lines; single line breaks kept as `<br>` |

### Key invariants

- Only the creator or assigned agent changes a listing; every action rechecks on the server under a row lock.
- A PUBLISHED listing is always complete: the database check covers price, address, description, coordinates, agent, and `published_at`; `listingInput` and the checklist cover the rest after every save.
- Status changes go only through spec 0002's transition functions.
- No field save overwrites a change it did not see; a form never adopts a token after a change it did not see.
- Every write to a listing goes through `touchListing`, with millisecond timestamps.
- Every stored photo URL is `https` on an allowed host (Cloudinary uploads only).
- A published listing never loses its cover.
- A listing's open leads always follow its assigned agent through a reassignment.
- Public caches refresh after any change to a published or previously published listing.

### Security model

- **Agents**: read all listings in any status; edit, publish, unpublish, mark sold, delete drafts, manage photos, and reassign only on listings they created or are assigned to.
- **Visitors and the public**: nothing in this feature; they see only PUBLISHED listings (and SOLD pages) through features 7, 10, 11, and 12.
- **Outbound requests**: the photo check and the short link resolver fetch only exact allowed hosts over `https` on every hop, with no cookies, a total time limit, and bounded redirects resolved by hand, so they can't be pointed at internal addresses. The host lists must stay exact matches.
- **Content**: titles, descriptions, and addresses are rendered as text, never HTML. The description also reaches the AI prompt as plain text (feature 7).
- **Reassignment** is reported to Sentry (`listing.reassigned`, tags `listing_id`, `from_agent_id`, `to_agent_id`, `by_agent_id`, `moved_leads`).

### Configuration required

- No new env vars.
- `lib/images.ts`: add `i.imgur.com` and `res.cloudinary.com` (upload paths only) to the allowed image hosts.

### Critical test scenarios

- Happy path: create a draft, fill the apartment fields, paste coordinates, add an Unsplash photo, write a description, publish; `searchPublishedListings` returns it, verifies **AC-2**, **AC-5**, **AC-7**, **AC-8**.
- Draft partial save: save with only a title, type, and area (price, address, description null); succeeds, checklist shows the rest missing, Publish disabled, verifies **AC-2**, **AC-4**, **AC-5**.
- Database guard: a raw update setting a published listing's `price_bdt` to null fails the check constraint, verifies **AC-5**.
- Publish with unsaved edits: type the description, press Publish without saving; the description is saved and the listing published, verifies **AC-5**.
- Publish race: in two sessions, remove the only photo while publishing; one of them fails and the listing never ends PUBLISHED without a cover, verifies **AC-5**, **AC-8**.
- Published save refused: remove the address of a published listing and save; refused with `incomplete`, nothing written, verifies **AC-4**.
- Partial semantics: save without `amenityIds`, the amenities stay; save a PLOT draft with `bedrooms` in the payload but no `propertyType`; `bedrooms` is cleared, verifies **AC-3**, **AC-4**, **AC-9**.
- Type change: an apartment with floor number becomes a plot; the warning lists the fields; after save they are null, verifies **AC-3**.
- Price: `12,500,000` saves as 12500000 and previews `BDT 12,500,000`; `0` and `12.5` are refused, verifies **AC-6**.
- Location: plain coordinates, a long Maps link with `!3d!4d`, a long link with `@`, and a short link all resolve; Kolkata is refused; a non Google link and a consent page redirect return `location_unreadable`; `saveListing` called directly with Kolkata's coordinates is refused, verifies **AC-7**.
- Photos: a Drive share link converts and saves; a private Drive file returns `drive_not_shared`; an `http` link, a host off the list, a Cloudinary `/image/fetch/` link, a PDF, a 20 MB image, and a removed Imgur image are refused; the 21st photo and a duplicate are refused, verifies **AC-8**.
- Cover: removing the cover of a draft moves it to the next photo; removing the cover of a published listing is refused, verifies **AC-8**.
- Lifecycle: unpublish removes the listing from search at once; mark sold makes the form read only and leaves the public page with a Sold badge; delete works on a draft and is refused on an unpublished listing, verifies **AC-10**.
- Reassign: the assigned agent hands over; two open leads and one WON lead on the listing: the two open ones move with SYSTEM notes, the WON one stays; the new agent can edit, the old one (not the creator) cannot; choosing the same agent changes nothing, verifies **AC-11**, **AC-12**.
- Rights: another agent opens the listing read only; calling `saveListing` directly returns `forbidden`, verifies **AC-12**.
- Conflict: two sessions load the listing; B saves; A adds a photo (applies, returns `formStale`), then A saves and gets `stale`; in a single session, adding a photo then saving works, verifies **AC-13**.
- List page: tabs, "Mine only", search by `aur-1042`, "Unassigned" advisor, and paging through 30 listings with no edits in between shows each listing once, verifies **AC-1**.
- Visitor: a signed in visitor gets a 404 on `/dashboard/listings`, and every action returns `{ ok: false, reason: "not_found" }`, verifies **AC-15**.

## Build plan

Tracer Bullet: first a thin thread from an empty dashboard to a listing the assistant can find, then thicken each part.

1. [x] Thin thread: migration `listing_drafts` (with the `serializeListing` non null assertion), `touchListing`, `/dashboard/listings` (Mine only, no tabs or search yet), `/dashboard/listings/new` with `createDraft`, an edit page with Basics, plain coordinate entry, one photo link (Unsplash only, no check), description, the publish checklist, and `publish` (save then publish under the row lock); confirm the listing appears in `searchPublishedListings`, satisfies **AC-2**, **AC-5**, **AC-15**
2. [x] The full form: type driven Details with the change warning, the merge and normalize rules, amenities, price input and preview, plain text description rules, `listingDraftInput`, the published save rule, the conflict check on saves, and read only mode for other agents, satisfies **AC-3**, **AC-4**, **AC-6**, **AC-9**, **AC-12**, **AC-13**, **AC-14**
3. [x] Photos: `normalizePhotoUrl` and `checkPhotoUrl` with the four hosts, Drive conversion, Cloudinary path rule, and Imgur placeholder check; the 20 photo limit, duplicates, move, cover, alt text, remove, `formStale` handling, and the new hosts in `lib/images.ts`, satisfies **AC-8**, **AC-13**
4. [x] Location links: full Maps link parsing, the short link resolver, and the Bangladesh bounds in both `resolveLocation` and saves, satisfies **AC-7**
5. [x] Lifecycle: unpublish, publish again, mark sold, delete draft, reassign with lead moves, the `updateTag` calls, and the Sentry event, satisfies **AC-10**, **AC-11**, **AC-12**, **AC-13**
6. [x] List page complete: tabs, search, "Mine only" toggle, open lead counts, Advisor, keyset paging, empty state, satisfies **AC-1**

## Consequences

**Positive**:
- Agents can start a listing in seconds and publish only when it's complete; the database itself refuses an incomplete published listing.
- One click Publish never loses typed changes, and concurrent agents can't slip a coverless listing out.
- No new vendors; photo upload (feature 20) later replaces only the photo link step.
- Pasted photos from the allowed hosts are optimized like uploaded ones.

**Negative / tradeoffs**:
- A migration changes three spec 0002 columns to nullable; every reader of non published listings must handle nulls.
- Google Drive links depend on each file's sharing setting and Google's tolerance; Drive throttles images under load, so a popular listing's photos may fail until they move to upload (feature 20).
- Agents whose photos live elsewhere (Facebook, Dropbox) must rehost them first.
- The short link resolver depends on Google's redirect format and on the server region (consent pages); when it fails, agents paste coordinates.
- Edits to published listings go live without review, so a typo reaches buyers at once.
- Agents can read colleagues' drafts.
- The row lock serializes all actions on one listing; harmless at agency scale.

**Neutral**:
- Spec 0002 changes: three nullable columns and a wider published check, a millisecond `updated_at` default, agents read all listings, drafts can be deleted, and "AGENT owner" means creator or assigned agent.
- Areas and amenities still change only through the seed file.

## Follow-up

- [ ] Update spec 0002: the `listing_drafts` migration (nullable `price_bdt`, `address_line`, `description`; wider `listings_published_complete_ck`; millisecond `updated_at` default), the agent read rule, the draft delete exception, `setCover` and `deletePhoto` taking a transaction, and "AGENT owner" defined as creator or assigned agent.
- [ ] Update spec 0003's `lib/images.ts` host list: add `i.imgur.com` and `res.cloudinary.com` (upload paths only).
- [ ] Feature 10 (property page) follows the public page rule here: SOLD visible with a badge and `noindex`, DRAFT and UNPUBLISHED 404.
- [ ] Feature 20 (photo upload) should offer to copy existing linked photos into Supabase Storage, starting with Drive links.
- [ ] If listings pass a few thousand, add a trigram index on `listings.title` for search.
