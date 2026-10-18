# Verify: Data model · spec 0002 · updated 2026-10-18
_Steps derived from spec 0002 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Run the database steps against a throwaway database (for example a fresh database in the local `aurevia-shadow` Postgres container), never against shared data. Server modules import `server-only`, so scripts run with `tsx --conditions=react-server`.

## Commands
- [ ] Empty database: `npx prisma migrate deploy` → `core_slice1` applies with no error → AC-1
- [ ] Catalog: every app table has `relrowsecurity = true`; with Supabase roles present, `anon` and `authenticated` hold no grants on any app table or `listing_ref_seq` → AC-1
- [ ] `npm run db:drift` (needs `SHADOW_DATABASE_URL`) → exit 0, "No difference detected" → AC-14
- [ ] `npm run db:seed` → 10 areas, 12 amenities, no listings → AC-2
- [ ] `npm run db:seed -- --sample` twice → still 10 areas, 12 amenities, 1 sample agent, 10 listings `AUR-1001` to `AUR-1010`; the next `nextListingRef` returns `AUR-1011` → AC-2

## Database behavior
- [ ] Set a draft listing to PUBLISHED with no coordinates → fails on `listings_published_complete_ck`; `price_bdt = 0` → `listings_price_positive_ck`; `ref_code = 'AUR-12'` → `listings_ref_code_format_ck` → AC-3
- [ ] `publishListing` on a listing with no cover and no coordinates → `PublishBlockedError` listing both; by an agent who neither created nor is assigned → `ForbiddenError` → AC-3
- [ ] Photo with both `url` and `storage_path` → `listing_photos_one_source_ck`; second cover by direct update → unique violation on `listing_photos_one_cover_uq`; `setCover` swaps the cover; `deletePhoto` on the cover of a PUBLISHED listing → `LastCoverError` → AC-4
- [ ] `listingInput`: a PLOT with bedrooms, an APARTMENT without `floorNumber`, and a `handoverDate` on a READY home are all rejected → AC-5
- [ ] `searchPublishedListings` with `limit: 4`, following `nextCursor` to the end → every published listing exactly once; amenities lift + gym → only `AUR-1004`, `AUR-1008`; price 12,000,000 to 18,500,000 → `AUR-1007`, `AUR-1008`, `AUR-1009` (bounds inclusive); any `minBedrooms` → no PLOT; `cursor: "nope"` → ZodError → AC-6
- [ ] Save a user and an assistant message (with tool parts and metadata) in one `saveMessages` call, then `loadMessages` → deep equal, same order; save the assistant id again with new parts → updated, still 2 rows, recommendation rows replaced; same id in another conversation → `MessageIdConflictError`; another user's conversation → `ForbiddenError`; client origin with an assistant message → `ForbiddenError` → AC-7
- [ ] Two `findOrCreateLeadAndViewing` calls in parallel for the same visitor and listing → one lead, one active viewing, `reused` is false for one and true for the other → AC-8
- [ ] Move the lead to CONTACTED, book again with a different name and date → same lead, snapshot name, conversation and status unchanged, same active viewing returned; `rescheduleViewing` cancels it and creates a new one → AC-8
- [ ] The new lead has `contact_name`/`contact_phone` from the booking, `contact_email` from the profile, `assigned_agent_id` from the listing; the profile now holds the name and phone → AC-9
- [ ] Scrub a profile and delete its conversations and AI usage → messages, briefs, recommendations gone; leads and viewings kept with `visitor_id` and `conversation_id` null; profile row kept with `deleted_at` → AC-10 (**blocked**: nulling both contact fields violates `leads_contact_ck`, see spec follow up)
- [ ] Two agents move the same lead CONTACTED → QUALIFIED at once → one succeeds, the other gets `StaleStatusError`; 2 STATUS_CHANGE activities total; `contacted_at` set → AC-11
- [ ] SOLD → PUBLISHED, a SELLER publishing a draft directly, COMPLETED → CONFIRMED, CONFIRMED without `confirmedFor` → all rejected with no change → AC-11

## Value sourcing
- [ ] `published_at` is set once, on the first move into PUBLISHED, with millisecond precision; UNPUBLISHED → PUBLISHED keeps the original value → Value sourcing (publish)
- [ ] Slug of a title with accents and a dash ("Smoke Test Flat — Zindabazar") → `smoke-test-flat-zindabazar-aur-NNNN`; a Bangla only title → `listing-aur-NNNN` → Value sourcing (create listing)
- [ ] `conversations.title` = first user message text cut to 60 characters; a later user message does not change it → Value sourcing (save chat message)
- [ ] `recordUsage` at 23:30 UTC (05:30 next day in Dhaka) → `day` is the Dhaka date, not the UTC date → Value sourcing (AI usage day)
- [ ] Listing card DTO has `priceBdt` and `landKatha` as plain numbers; an uploaded photo's URL is the Supabase public URL of `listing-photos/<storage_path>` → Value sourcing (listing card)
- [ ] Photo `alt` defaults to the listing title in the seed → Value sourcing (listing photo)

## Acceptance-criteria coverage
- AC-1 migrate deploy, catalog · AC-2 seed steps · AC-3 SQL checks, publishListing · AC-4 photo steps · AC-5 listingInput · AC-6 search paging and filters · AC-7 chat round trip · AC-8 concurrent booking, reuse · AC-9 snapshot · AC-10 deletion shape (blocked) · AC-11 transitions · AC-14 drift
- AC-12 and AC-13 are checked by features 14, 24, and 25.
