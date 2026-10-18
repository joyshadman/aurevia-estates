# 0002. Core data model for Aurevia Estates

**Date**: 2026-10-17
**Status**: In Progress

## Summary

This spec fixes the database shape every slice builds on: people, areas, listings, chats, and the leads and viewings that come out of them. It is designed whole now (through paid featuring) so later slices only add tables, never reshape old ones. Each slice migrates just the tables it uses, so slice 1 ships one migration and later features add theirs. Listings use plain typed columns so the AI search tool can filter them exactly and never suggest a home that breaks the budget.

## Requirements

**User stories**:
- As an agent, I want listings stored with the details buyers ask about (area, price, type, beds, size, amenities, photos) so the assistant can match them.
- As a visitor, I want my chat and what I told the assistant kept with my account, so I can come back to it.
- As an agent, I want each booked viewing to arrive as one lead with the visitor's contact, the listing, and the chat, so I can follow up.
- As a visitor, I want deleting my account to remove my chats and personal details.
- As the builder of later slices, I want to add saved homes, seller review, and paid featuring without breaking migrations.

**Acceptance criteria**:
- **AC-1**: The slice 1 migration applies cleanly to an empty local database and to staging with `prisma migrate deploy`. Every app table has row level security enabled with no policies, and the `anon` and `authenticated` roles hold no grants on any app table.
- **AC-2**: `prisma db seed` loads the Sylhet areas and the amenity list on every environment, and the sample agent plus about 10 sample listings only when run with `--sample`. Running it twice creates no duplicates.
- **AC-3**: The database enforces listing invariants: unique `slug`, unique `ref_code` matching `^AUR-[0-9]{4,}$`, `price_bdt > 0`, and a `PUBLISHED` listing always has an assigned agent, coordinates, and `published_at` (SQL checks). `publishListing` also requires a cover photo and the type's required fields.
- **AC-4**: The database enforces photo invariants: each photo has exactly one of `url` or `storage_path`, and a listing has at most one cover photo. `setCover` swaps the cover in one transaction, and the last cover of a PUBLISHED listing cannot be removed or demoted.
- **AC-5**: The shared listing Zod schema rejects a listing missing its type's required fields (table under *Key invariants*) and rejects fields that do not apply (bedrooms on a plot).
- **AC-6**: The listing search query (published only, by area, property type, price range, minimum bedrooms, and required amenities, with the filter rules under *API surface*) returns exactly the published listings that match every filter, pages without skipping or repeating rows, and is backed by the indexes listed in the data model.
- **AC-7**: A chat message saved with its AI SDK `parts` reloads with identical `parts`, in send order (by `seq`, even when saved in one transaction). Saving the same message id again in the same conversation updates its `parts` (regenerate, continuation) without duplicating it. A message id already used in another conversation, a conversation the user does not own, or a client submitted role other than USER is rejected.
- **AC-8**: While a visitor has an open lead (`NEW`, `CONTACTED`, `QUALIFIED`) on a listing, a new booking on that listing reuses the lead without changing its snapshot, conversation, or status. If that lead already has an active viewing (`REQUESTED` or `CONFIRMED`), the booking returns it unchanged (only the explicit reschedule path replaces it). Two concurrent bookings produce one lead and one active viewing.
- **AC-9**: Every lead keeps its own contact snapshot (name, phone, email) copied at creation, and `assigned_agent_id` copied from the listing at creation. A chat booking cannot fail the contact check: the booking requires a name and phone and saves them to the profile first.
- **AC-10**: The account deletion shape works: scrubbing a profile (set `deleted_at`; clear name, email, phone, avatar, agent card; `agent_is_public = false`) plus deleting the visitor's conversations removes their messages, briefs, and recommendations by cascade. Their saved homes and AI usage rows are deleted. Their leads and viewings remain with `visitor_id` null, the contact snapshot scrubbed, `leads.message` null, and `viewings.cancel_reason` replaced. Deleting the Supabase auth user afterward does not delete the profile row, and `getCurrentUser()` never overwrites a profile with `deleted_at` set.
- **AC-11**: Listing, viewing, and lead status changes go only through `transitionListing`, `transitionLead`, and `transitionViewing`, which reject transitions not in the state machines below, reject an actor without rights, and fail cleanly (no change) if the status changed concurrently.
- **AC-12** (checked by features 14, 24, 25, not a gate for this feature): The later slice migrations (saved homes, listing reviews, featured placements and payments) are additive: they create tables, indexes, and enum values only, and never drop, rename, or retype a slice 1 column.
- **AC-13** (checked by feature 25, not a gate for this feature): Two featured placements for the same listing cannot overlap in time (database exclusion constraint).
- **AC-14**: After the raw SQL is appended and applied, `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code` (with the shadow database) reports no drift.

## Decision

**Chosen option**: Option 2: one relational model with typed columns, lookup tables for areas and amenities, and per slice additive migrations.

Store everything in Postgres `public` through Prisma, using a typed nullable column for each property attribute, `Area` and `Amenity` lookup tables, one row per chat message with AI SDK parts as `jsonb`, and `Lead` as the parent of `Viewing`. Design the whole target now and migrate it in four additive steps owned by the features that need them.

**Implementation skills**: `prisma-orm-setup` (`prisma/skills`, `.claude/skills/prisma-orm-setup/`) · `prisma-client-api` (`prisma/skills`, `.claude/skills/prisma-client-api/`) · `supabase-postgres-best-practices` (`supabase/agent-skills`, `.claude/skills/supabase-postgres-best-practices/`) · `supabase` (`supabase/agent-skills`, `.claude/skills/supabase/`) · `ai-sdk` (`vercel/ai`, `.claude/skills/ai-sdk/`, for the `UIMessage` parts shape)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

### Conventions for every table

- **Names**: Prisma models are PascalCase, mapped to lowercase snake_case tables and columns with `@@map` and `@map` (no quoted identifiers in SQL).
- **Primary keys**: UUID v7 generated by Prisma (`@default(uuid(7))`, time ordered, not guessable), stored as `@db.Uuid`. Exceptions: `profiles.id` is the Supabase auth user id; `chat_messages.id` is the AI SDK message id (`text`); join tables use composite keys.
- **Timestamps**: `created_at timestamptz default now()`, `updated_at` via Prisma `@updatedAt`, all UTC, shown in `Asia/Dhaka`.
- **Money**: whole taka in `bigint` (Prisma `BigInt`). Convert to `number` at the server to client boundary with one helper (`toTaka`), since React props cannot carry `bigint`. Values stay far below `Number.MAX_SAFE_INTEGER`.
- **Coordinates**: `double precision` (Prisma `Float`), not `Decimal`, so map code gets plain numbers.
- **Foreign keys**: every FK column gets an index. Listings, areas, and amenities are never hard deleted (status or `is_active` instead), so FKs to them use `ON DELETE RESTRICT`.
- **Row level security**: every migration that creates a table enables RLS with no policies and revokes all from `anon` and `authenticated` (per spec 0001).
- **Raw SQL**: check constraints, partial unique indexes, the exclusion constraint, and the RLS lines are appended to the generated migration file (`prisma migrate dev --create-only`, edit, then apply). Each one is listed below with an explicit name (`<table>_<rule>_ck`, `<table>_<rule>_uq`, `<table>_<rule>_ex`) so error handling can match on it. The revokes for `anon` and `authenticated` (tables and `listing_ref_seq`) are wrapped in `do $$ ... if exists (select from pg_roles where rolname = ...) $$` so they also run on the shadow database and in CI.
- **Client side defaults**: `uuid(7)` and `@updatedAt` are applied by Prisma, not Postgres. The raw SQL also sets `default now()` on every `updated_at`; any raw insert must still supply `id`.
- **Serialization**: `bigint` and `Decimal` never cross to the browser or into AI tool output. Every listing card, page, and tool result goes through one mapper, `serializeListing`, that returns plain numbers (`toTaka`, `toKatha`).
- **Role names**: the uppercase `user_role` enum here replaces spec 0001's lowercase `visitor`, `agent`, `seller`.

### Data model sketch

**Enums**: `user_role` (VISITOR, AGENT, SELLER) · `deal_type` (SALE) · `property_type` (APARTMENT, DUPLEX, VILLA, HOUSE, PLOT, COMMERCIAL) · `listing_status` (DRAFT, PENDING_REVIEW, CHANGES_REQUESTED, REJECTED, PUBLISHED, UNPUBLISHED, SOLD) · `completion_status` (READY, UNDER_CONSTRUCTION) · `message_role` (USER, ASSISTANT, SYSTEM) · `lead_source` (CHAT_BOOKING, CONTACT_FORM, LISTING_INQUIRY) · `lead_status` (NEW, CONTACTED, QUALIFIED, WON, LOST) · `viewing_status` (REQUESTED, CONFIRMED, COMPLETED, CANCELLED, NO_SHOW) · `lead_activity_type` (NOTE, STATUS_CHANGE, VIEWING_CHANGE, SYSTEM). Later: `review_decision`, `placement_source`, `payment_status`, `payment_purpose` (with their migrations).

#### Slice 1 tables (migration `core_slice1`, built by this feature)

**`profiles`** (one per Supabase user; tombstone kept after deletion)
| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid PK | no | equals `auth.users.id`; **no FK** to `auth.users` (see invariants) |
| role | user_role | no | default VISITOR; never from client input |
| email | text | yes | copied from auth on upsert; null after deletion |
| full_name | text | yes | |
| phone | text | yes | E.164 form (`+8801…`), asked at first booking |
| avatar_url | text | yes | |
| agent_title, agent_whatsapp, agent_bio, agent_photo_url | text | yes | used only when role = AGENT |
| agent_is_public | boolean | no | default false |
| deleted_at | timestamptz | yes | set by account deletion |
| created_at, updated_at | timestamptz | no | |

**`areas`**: id · slug text unique · name_en text · name_bn text · center_lat, center_lng float · is_active boolean default true · sort_order int.

**`amenities`**: id · slug text unique · label text · label_bn text null · icon text null · sort_order int · is_active boolean default true.

**`listings`**
| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid PK | no | |
| slug | text unique | no | `<slugified title>-aur-1042`, fixed at creation; title slugified to ASCII, capped at 60 characters, fallback `listing` when empty |
| ref_code | text unique | no | `AUR-` + `nextval('listing_ref_seq')`, sequence starts at 1001; check `listings_ref_code_format_ck` (`^AUR-[0-9]{4,}$`) |
| deal_type | deal_type | no | default SALE |
| property_type | property_type | no | |
| status | listing_status | no | default DRAFT |
| title, description | text | no | English only |
| price_bdt | bigint | no | check `> 0` |
| price_negotiable | boolean | no | default false |
| area_id | uuid FK → areas | no | RESTRICT |
| address_line | text | no | |
| latitude, longitude | float | yes | required to publish |
| bedrooms, bathrooms | int | yes | check `>= 0` |
| built_up_sqft | int | yes | check `> 0` |
| land_katha | decimal(7,2) | yes | check `> 0` |
| floor_number, total_floors, parking_spaces | int | yes | |
| completion_status | completion_status | yes | null for PLOT |
| handover_date | date | yes | only when UNDER_CONSTRUCTION |
| created_by_id | uuid FK → profiles | no | RESTRICT |
| assigned_agent_id | uuid FK → profiles | yes | null only before approval (see the published check below) |
| published_at | timestamptz | yes | set from an app side millisecond `Date` (never `now()`), so cursors round trip through JS exactly |
| sold_at | timestamptz | yes | |
| created_at, updated_at | timestamptz | no | |

Check `listings_published_complete_ck`: `status <> 'PUBLISHED' or (latitude is not null and longitude is not null and published_at is not null and assigned_agent_id is not null)`.
Indexes: `(status, published_at desc, id desc)` (search sort) · `(status, area_id, price_bdt)` · `(status, property_type, bedrooms)` · `(assigned_agent_id, status)` · `(created_by_id)` · `(area_id)`.

**`listing_amenities`**: PK `(listing_id, amenity_id)` · FK listing CASCADE · FK amenity RESTRICT · index `(amenity_id)`.

**`listing_photos`**: id · listing_id FK CASCADE · url text null · storage_path text null (object path in the public `listing-photos` bucket, feature 20) · sort_order int · is_cover boolean default false · alt text (defaults to the listing title when the agent leaves it empty) · width, height int null (null for pasted links; set by the upload flow in feature 20) · created_at.
Check `listing_photos_one_source_ck`: `num_nonnulls(url, storage_path) = 1`. Partial unique index `listing_photos_one_cover_uq` on `(listing_id) where is_cover`. Index `(listing_id, sort_order)`. The display URL comes from one helper, `photoUrl(photo)`: `url` as is, or the Supabase public URL of `storage_path`.

**`conversations`**: id · user_id FK → profiles CASCADE · title text null (first user message, cut to 60 characters, set on its first save) · start_listing_id FK → listings null, SET NULL · last_message_at timestamptz (set in every message save transaction) · created_at, updated_at. Index `(user_id, last_message_at desc)`.

**`chat_messages`**: id text PK (AI SDK message id) · seq bigint `generated always as identity` (the send order) · conversation_id FK CASCADE · role message_role · parts jsonb (AI SDK `UIMessage.parts`) · text_content text (the `text` parts joined with `\n`; other part types are skipped) · metadata jsonb null · created_at. Index `(conversation_id, seq)`. Reads order by `seq`.

**`search_briefs`** (1:1 conversation): conversation_id uuid PK, FK CASCADE · budget_min_bdt, budget_max_bdt bigint null · property_types property_type[] default `{}` · area_ids uuid[] default `{}` · amenity_ids uuid[] default `{}` · min_bedrooms, min_bathrooms, family_size int null · notes text null · updated_at. Updates replace each field that the AI tool provides and leave the others alone (arrays are replaced, not merged).
Check: `budget_min_bdt is null or budget_max_bdt is null or budget_min_bdt <= budget_max_bdt`. The id arrays carry no FK (areas and amenities are never hard deleted); the brief service validates ids on write.

**`listing_recommendations`**: id · conversation_id FK CASCADE · message_id text FK → chat_messages CASCADE · listing_id FK RESTRICT · rank int (zero based, across the unique listing ids of that message in first seen order, over all its search tool results) · created_at. Unique `(message_id, listing_id)`. Indexes `(conversation_id)`, `(listing_id)`. When an assistant message is saved again, its recommendation rows are replaced.

**`leads`**
| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid PK | no | |
| source | lead_source | no | |
| status | lead_status | no | default NEW |
| visitor_id | uuid FK → profiles | yes | SET NULL; null for a signed out contact form |
| listing_id | uuid FK → listings | yes | RESTRICT; null for a general contact form |
| conversation_id | uuid FK → conversations | yes | SET NULL |
| assigned_agent_id | uuid FK → profiles | yes | SET NULL |
| contact_name | text | no | snapshot |
| contact_phone, contact_email | text | yes | snapshot; at least one present (check) |
| message | text | yes | |
| contacted_at | timestamptz | yes | first move out of NEW |
| created_at, updated_at | timestamptz | no | |

Partial unique index `leads_open_per_visitor_listing_uq`: `(visitor_id, listing_id) where status in ('NEW','CONTACTED','QUALIFIED') and visitor_id is not null and listing_id is not null`. Check `leads_contact_ck`: `contact_phone is not null or contact_email is not null`. Indexes `(assigned_agent_id, status, created_at desc)`, `(visitor_id)`, `(listing_id)`, `(conversation_id)`.

**`viewings`**: id · lead_id FK CASCADE · requested_for timestamptz · confirmed_for timestamptz null · status viewing_status default REQUESTED · cancel_reason text null · created_at, updated_at. The listing comes from the lead (no `listing_id` column, so they cannot drift); a viewing can only be created on a lead whose `listing_id` is set.
Partial unique index `viewings_active_per_lead_uq`: `(lead_id) where status in ('REQUESTED','CONFIRMED')`. Index `(lead_id, requested_for)`. Check `viewings_confirmed_time_ck`: `status <> 'CONFIRMED' or confirmed_for is not null`.

**`lead_activities`**: id · lead_id FK CASCADE · actor_id FK → profiles null, SET NULL · type lead_activity_type · body text null · from_status, to_status text null · created_at. Index `(lead_id, created_at)`.

**`ai_usage_daily`**: PK `(user_id, day)` · user_id FK CASCADE · day date (the `Asia/Dhaka` calendar day) · message_count int default 0 · input_tokens, output_tokens int default 0.

#### Later tables (each in its own additive migration)

**`saved_homes`** (migration `saved_homes`, feature 14): PK `(user_id, listing_id)` · user FK CASCADE · listing FK RESTRICT · created_at · index `(listing_id)`.

**`listing_reviews`** (migration `listing_reviews`, feature 24): id · listing_id FK CASCADE · reviewer_id FK → profiles SET NULL · decision review_decision (APPROVED, REJECTED, CHANGES_REQUESTED) · reason text null (required unless APPROVED, check) · created_at · index `(listing_id, created_at desc)`.

**`payments`** and **`featured_placements`** (migration `featuring_payments`, feature 25; that spec may refine `payments`):
- `payments`: id · payer_id FK → profiles SET NULL · listing_id FK RESTRICT · provider text · provider_ref text · amount_bdt bigint check `> 0` · currency char(3) default `BDT` · status payment_status (PENDING, SUCCEEDED, FAILED, REFUNDED) · purpose payment_purpose (FEATURED_LISTING) · provider_payload jsonb null · created_at, updated_at · unique `(provider, provider_ref)`.
- `featured_placements`: id · listing_id FK RESTRICT · starts_at, ends_at timestamptz, check `ends_at > starts_at` · source placement_source (PAID, MANUAL) · payment_id FK unique null · created_by_id FK SET NULL · created_at · check `source <> 'PAID' or payment_id is not null` · exclusion constraint `exclude using gist (listing_id with =, tstzrange(starts_at, ends_at) with &&)` (needs `create extension if not exists btree_gist`). "Currently featured" is computed at read time (`now()` within the range), never stored.

### Relationships

| From | To | Cardinality |
|---|---|---|
| profiles | listings (created_by, assigned_agent) | 1:N each |
| areas | listings | 1:N |
| listings | amenities | N:M via listing_amenities |
| listings | listing_photos, listing_reviews, featured_placements | 1:N |
| profiles | conversations | 1:N |
| conversations | chat_messages, listing_recommendations | 1:N |
| conversations | search_briefs | 1:1 |
| profiles, listings | saved_homes | N:M |
| leads | viewings, lead_activities | 1:N (a viewing's listing is its lead's listing) |
| listings, profiles, conversations | leads | 1:N (all optional) |
| payments | featured_placements | 1:1 (optional) |

### State transitions

Each entity has a pure map in `lib/domain/*-status.ts` (`assert*Transition(from, to, actor)`) and one server function that is the only writer of `status`: `transitionListing(id, to, actor)`, `transitionLead(id, to, actor, note?)`, `transitionViewing(id, to, actor, extra?)` in `lib/server/`. Each runs in one transaction: check the actor's rights (role and ownership per the security model), apply a guarded update (`updateMany where id and status = from`; zero rows means a concurrent change and it throws `StaleStatusError`), set the side effect columns, and write the activity row. `publishListing(id, actor)` checks the publish preconditions (cover photo, type fields), sets `published_at`, then calls `transitionListing`.

**Listing**:
- Agent: DRAFT → PUBLISHED · PUBLISHED ⇄ UNPUBLISHED · PUBLISHED or UNPUBLISHED → SOLD.
- Seller: DRAFT → PENDING_REVIEW · CHANGES_REQUESTED → PENDING_REVIEW.
- Agent reviewing: PENDING_REVIEW → PUBLISHED (sets `assigned_agent_id` to the reviewer if empty) · PENDING_REVIEW → CHANGES_REQUESTED · PENDING_REVIEW → REJECTED.
- SOLD and REJECTED are terminal. Entering PUBLISHED sets `published_at` the first time; entering SOLD sets `sold_at`.
- Leaving PUBLISHED (to UNPUBLISHED or SOLD) leaves open viewings as they are; the agent handles them from the inbox. New bookings need a PUBLISHED listing.

**Lead**: NEW → CONTACTED → QUALIFIED → WON · any open state → LOST · NEW → QUALIFIED allowed. WON and LOST are terminal (a returning buyer opens a new lead). Leaving NEW sets `contacted_at`. Every change writes a `lead_activities` STATUS_CHANGE row in the same transaction.

**Viewing**: REQUESTED → CONFIRMED (needs `confirmed_for`) · REQUESTED or CONFIRMED → CANCELLED · CONFIRMED → COMPLETED or NO_SHOW. A reschedule cancels the active viewing and creates a new one in one transaction. Every change writes a VIEWING_CHANGE activity.

### API surface

This feature ships no HTTP endpoints. Its surface is the schema plus a small set of shared server modules that later features call.

| Module / function | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `prisma/schema.prisma` + migration `core_slice1` | schema | | slice 1 tables | n/a | migration fails on drift |
| `prisma/seed.ts` + `prisma/seed-data.ts` | script | `--sample` flag (opt) | areas, amenities, sample agent and listings | service connection | none; rerun safe |
| `lib/domain/listing-schema.ts` `listingInput` | Zod | listing fields by `propertyType` | parsed input | n/a | ZodError per field |
| `lib/server/listings.ts` `nextListingRef(title)` | function | title | `{ refCode, slug }` from `nextval` + title | server only | none |
| `lib/server/listings.ts` `publishListing(id, actor)` | function | listing id, actor | listing | AGENT | `PublishBlockedError` (lists what is missing) |
| `lib/server/listings.ts` `searchPublishedListings(filters)` | function | areaIds?, propertyTypes?, minPrice?, maxPrice?, minBedrooms?, amenityIds?, cursor?, limit (default 12, max 24) | serialized cards + `nextCursor` | server only (public data) | ZodError on bad filters or cursor |
| `lib/server/listings.ts` `serializeListing(row)` | function | Prisma listing | plain JSON DTO (numbers only) | n/a | none |
| `lib/server/photos.ts` `photoUrl`, `setCover(photoId, actor)`, `deletePhoto(photoId, actor)` | functions | photo id, actor | photo / URL | AGENT owner | `LastCoverError` on a PUBLISHED listing |
| `lib/server/chat-store.ts` `saveMessage(conversationId, message, actor)` | function | conversation id, AI SDK `UIMessage` | saved row | conversation owner | `ForbiddenError`, `MessageIdConflictError` |
| `lib/server/bookings.ts` `findOrCreateLeadAndViewing(input, actor)` | function | listingId, requestedFor, name, phone, conversationId? | `{ lead, viewing, reused }` | VISITOR | `ListingNotBookableError` |
| `lib/server/ai-usage.ts` `recordUsage(userId, usage)` | function | message count, tokens (missing usage counts as 0) | counters | server only | none |
| `lib/server/*-status.ts` `transitionListing`, `transitionLead`, `transitionViewing` | functions | id, to, actor | updated row | per security model | `InvalidTransitionError`, `ForbiddenError`, `StaleStatusError` |
| `lib/domain/*-status.ts` `assert*Transition` | pure function | from, to, actor | void | n/a | `InvalidTransitionError` |
| `lib/server/money.ts` `toTaka(bigint)`, `fromTaka(number)`, `toKatha(Decimal)` | functions | value | number / bigint | n/a | `fromTaka` rejects NaN, fractions, and values `<= 0`; `toTaka` throws above safe integer |

**Search filter rules**: areas and property types match any of the chosen values; amenities must all be present (one `some` clause per amenity, joined by AND); price bounds are inclusive; a listing with null `bedrooms` never matches a `minBedrooms` filter; `family_size`, `min_bathrooms`, and `notes` from the brief go to the AI prompt as context, not into the query.

**Pagination**: keyset on `(published_at desc, id desc)`. The cursor is opaque base64url of `{ publishedAt: ISO string, id }`. Featured first ordering (feature 25) later changes only the sort, not any column.

**Message save** (`saveMessage`): first check the conversation belongs to the actor. Clients may submit only USER messages; ASSISTANT messages are saved only by the server on finish. Write with `insert ... on conflict (id) do update set parts, text_content, metadata where chat_messages.conversation_id = excluded.conversation_id`; if no row comes back, the id belongs to another conversation and it throws `MessageIdConflictError`. The same transaction sets `last_message_at`, sets `title` if empty, and for an assistant message replaces its recommendation rows.

**Booking** (`findOrCreateLeadAndViewing`): the listing must be PUBLISHED. Save name and phone to the profile, then in one transaction: raw `insert into leads ... on conflict (visitor_id, listing_id) where <open predicate> do nothing returning *`, and if nothing is returned, select the open lead. Do the same for the viewing on `(lead_id) where <active predicate>`. A reused lead keeps its snapshot, conversation, and status. An existing active viewing is returned unchanged; changing its time goes through the reschedule path (`transitionViewing` to CANCELLED plus a new viewing in one transaction). Never catch `P2002` inside a transaction (the transaction is already aborted); the conflict clauses make it unnecessary.

**AI usage** (`recordUsage`): raw `insert ... on conflict (user_id, day) do update set message_count = message_count + 1, ...` with `day` computed in SQL.

### Value sourcing

| Action | Value | Source |
|---|---|---|
| Create listing | `ref_code`, `slug` | `nextval('listing_ref_seq')` read by `nextListingRef()`; slug = slugified `title` + lowercased ref code |
| Create listing | `created_by_id` | current user from `getCurrentUser()` (spec 0001) |
| Create listing | `assigned_agent_id` | creator when role is AGENT; reviewer on approval for seller listings |
| Publish listing | `published_at` | `now()` at the first transition into PUBLISHED |
| Save chat message | `id` | AI SDK message id (client id for user messages, server `generateMessageId` for assistant messages) |
| Save chat message | `seq` | Postgres identity, assigned on insert |
| Save chat message | `text_content` | `text` parts of `parts` joined with `\n` |
| Save chat message | `conversations.title` | first user message, cut to 60 characters, when empty |
| Save chat message | `conversations.last_message_at` | `now()` in the save transaction |
| Save recommendation | `message_id`, `rank` | the assistant message saved on finish; rank as defined on the table |
| Update brief | each field | value provided by the AI brief tool replaces the stored one; omitted fields unchanged |
| Create lead | `contact_name`, `contact_phone` | booking input (required), also written to the profile; if a name is ever missing, the part of the email before the @ |
| Create lead | `contact_email` | `profiles.email` at creation; contact form input when signed out |
| Create lead | `assigned_agent_id` | `listings.assigned_agent_id` at creation; null for a general contact form (inbox shows it to all agents) |
| Create lead | reuse vs new | open lead lookup on `(visitor_id, listing_id)` inside the booking transaction |
| AI usage counter | `day` | `(now() at time zone 'Asia/Dhaka')::date`, computed in SQL |
| Publish listing | `published_at` value | app side `new Date()` (millisecond precision) |
| Listing card | price, land size, photo URL | `serializeListing` via `toTaka`, `toKatha`, `photoUrl` |
| Listing photo | `alt` | agent input, else the listing title |
| Search page | `nextCursor` | base64url of the last row's `published_at` and `id` |
| Currently featured (later) | boolean | `featured_placements` row where `now()` is within `[starts_at, ends_at)` |
| Delete account | scrub values | constants: `full_name`, `email`, `phone`, `avatar_url`, and agent text fields null, `agent_is_public = false`; on their leads `visitor_id` null, `contact_name = 'Deleted user'`, phone, email, and `message` null; on their viewings `cancel_reason = 'Removed on account deletion'` where set |

### Key invariants

- A listing's `slug` and `ref_code` never change after creation.
- `PUBLISHED` requires: assigned agent, coordinates (SQL checks), at least one photo with a cover, and the type's required fields (`publishListing` plus Zod).
- Type rules in `listingInput`:

| Type | Required | Must be empty |
|---|---|---|
| APARTMENT | bedrooms, bathrooms, built_up_sqft, floor_number, completion_status | land_katha |
| DUPLEX, VILLA, HOUSE | bedrooms, bathrooms, built_up_sqft, land_katha, completion_status | |
| PLOT | land_katha | bedrooms, bathrooms, built_up_sqft, floor_number, completion_status |
| COMMERCIAL | built_up_sqft, completion_status | bedrooms |

- `handover_date` is set only when `completion_status = UNDER_CONSTRUCTION`.
- One open lead per visitor per listing; one active viewing per lead (partial unique indexes), resolved with `on conflict do nothing` in `findOrCreateLeadAndViewing`, so a double click is idempotent.
- A `chat_messages.id` belongs to one conversation forever (see *Message save*).
- Recommendations are written in the same transaction as the assistant message they belong to (on finish), so the FK always holds.
- Status changes only through the transition functions; lead and viewing changes always write an activity row.
- A PUBLISHED listing always keeps a cover photo (`setCover` and `deletePhoto` enforce it).
- `profiles.role` changes only through the service role seed or admin script.
- `getCurrentUser()` creates a missing profile with `insert ... on conflict (id) do nothing` (safe under concurrent first logins), and treats a profile with `deleted_at` set as signed out; it never updates it.
- Agent notes in `lead_activities.body` are agency records and are kept on deletion; the inbox UI tells agents not to paste buyer personal data into notes.

### Security model

All access goes through server code and the `requireRole` helper from spec 0001; RLS denies the public API everything.
- **Visitor**: reads and updates own profile (not `role`); reads published listings, areas, amenities; full access to own conversations, messages, briefs, recommendations, saved homes; reads own leads and viewings (status and time only, not activities); creates bookings for themselves.
- **Agent**: everything on listings they created or are assigned to; reviews any PENDING_REVIEW listing; reads and updates **all** leads, viewings, and activities (the inbox defaults to "assigned to me"); reads a lead's linked conversation through the lead only; reads visitor contact only via the lead snapshot.
- **Seller**: creates and edits own listings in DRAFT or CHANGES_REQUESTED, submits for review, reads own listings' status and review reasons; sees lead and viewing **counts** for own listings, never buyer details.
- **Public (signed out)**: published listings, areas, amenities, public agent cards (`agent_is_public`), and the contact form only.
- **Personal data**: name, phone, email, and chat content are personal data. Deletion follows AC-10; the deletion flow itself is feature 17.

### Configuration required

None. This feature adds no environment variables (it uses `DATABASE_URL` and `DIRECT_URL` from spec 0001). The seed reads a `--sample` command line flag, not an env var.

### Critical test scenarios

Run against the local Supabase stack.
- Happy path: migrate an empty database, seed with `--sample`, create a listing through `listingInput` and `nextListingRef`, publish it, find it with `searchPublishedListings`, verifies **AC-1**, **AC-2**, **AC-3**, **AC-6**.
- Seed rerun: running the seed twice leaves the same row counts, verifies **AC-2**.
- Invalid listing: a plot with bedrooms and an apartment without floor are rejected; publishing without coordinates fails the SQL check, verifies **AC-3**, **AC-5**.
- Photos: a photo with both `url` and `storage_path` fails; a second cover fails, verifies **AC-4**.
- Chat round trip: save a user and an assistant message with tool parts in one transaction, reload in send order, deep equal; save the assistant id again with new parts and see them updated; reuse an id from another conversation, write to another user's conversation, and submit an ASSISTANT role from the client, each rejected, verifies **AC-7**.
- Concurrent booking: two bookings for the same visitor and listing run in parallel; one lead and one active viewing result, and the second call returns them with `reused: true`, verifies **AC-8**, **AC-9**.
- Search paging: page through 30 seeded listings with limit 12 and see each exactly once; filter by two amenities and get only listings with both, verifies **AC-6**.
- Concurrent status change: two agents move the same lead at once; one succeeds, the other gets `StaleStatusError`, verifies **AC-11**.
- Drift: `prisma migrate diff --exit-code` passes after the raw SQL, verifies **AC-14**.
- Deletion shape: scrub a profile and delete its conversations, then delete the auth user; messages, briefs, recommendations gone, leads present and scrubbed, profile tombstone present, verifies **AC-10**.
- Invalid transitions: SOLD → PUBLISHED, a seller publishing directly, and COMPLETED → CONFIRMED all throw, verifies **AC-11**.
- Overlap (feature 25): two overlapping placements for one listing fail on the exclusion constraint, verifies **AC-13**.
- RLS: with the public key, selecting from `listings` and `profiles` returns a permission error, verifies **AC-1**.

## Build plan

Tracer Bullet: this feature lays the slice 1 schema that slice 1's thin thread (sign in → listing → chat → booking → inbox) runs through. Later tables land with the features that first use them, each as an additive migration.

1. [x] Write the slice 1 models and enums in `prisma/schema.prisma` with `@@map`/`@map` snake_case names, UUID v7 defaults, and FK indexes. If the scaffold already created a minimal `profiles`, extend it rather than recreating it, satisfies **AC-1**.
2. [x] Generate `core_slice1` with `--create-only`; append raw SQL with the names given above: `listing_ref_seq` (start 1001), every check constraint, the partial unique indexes (cover photo, open lead, active viewing), `updated_at` defaults, RLS enable plus guarded revokes for each table and the sequence. Do not add the `profiles → auth.users` FK. Apply locally, then run the `migrate diff --exit-code` drift check; then apply on staging, satisfies **AC-1**, **AC-3**, **AC-4**, **AC-8**, **AC-10**, **AC-14**.
3. [x] Write `prisma/seed-data.ts` (areas with Bangla names and center coordinates: Zindabazar, Uposhohor, Tilagor, Kumarpara, Mirabazar, Ambarkhana, Bagbari, Khadim, plus any you add; a standard amenity list; 10 sample listings mirroring the mockups with fixed refs `AUR-1001` to `AUR-1010`, fixed slugs, and photo URLs) and `prisma/seed.ts`: areas and amenities are created only if their slug is missing (agent edits survive); behind `--sample`, a sample agent with a fixed uuid (it has no auth user and cannot sign in) and the sample listings upserted by ref, then `select setval('listing_ref_seq', greatest((select max(substring(ref_code from 5)::int) from listings), 1010))`. Wire it in `prisma.config.ts`, satisfies **AC-2**.
4. [x] Write `lib/domain/listing-schema.ts` (type rules table), `lib/server/money.ts`, and `lib/server/listings.ts` (`nextListingRef`, `serializeListing`, `publishListing`, `searchPublishedListings` with the filter rules and cursor), plus `lib/server/photos.ts`, satisfies **AC-3**, **AC-4**, **AC-5**, **AC-6**.
5. Write `lib/server/chat-store.ts` (`saveMessage`), `lib/server/bookings.ts` (`findOrCreateLeadAndViewing`), and `lib/server/ai-usage.ts` (`recordUsage`); update `getCurrentUser()` for the tombstone and the conflict safe insert, satisfies **AC-7**, **AC-8**, **AC-9**, **AC-10**.
6. [x] Write the pure transition maps and the three `transition*` server functions, satisfies **AC-11**.
7. Write the database tests above for slice 1 (seed, invariants, paging, chat round trip, concurrent booking, concurrent status change, deletion shape, RLS, drift), satisfies **AC-1** to **AC-11**, **AC-14**.
8. (Feature 14) Add `saved_homes` as an additive migration with RLS, satisfies **AC-12**.
9. (Feature 24) Add `review_decision` and `listing_reviews` as an additive migration, satisfies **AC-12**.
10. (Feature 25) Add `btree_gist`, `payments`, `featured_placements` with the exclusion constraint, after that spec refines `payments`, satisfies **AC-12**, **AC-13**.

## Consequences

**Positive**:
- Later slices add tables only; no slice 1 data migration is planned.
- The AI search tool filters plain indexed columns, so results are exact and explainable.
- Chats reload exactly (tool calls and listing cards included) because AI SDK parts are stored as is.
- One lead per visitor and listing keeps the inbox clean, and the database (not just code) enforces it.

**Negative / tradeoffs**:
- A wide `listings` table with many nullable columns; correctness by type depends on the Zod schema and `publishListing`, not the database.
- Several constraints live in raw SQL that `schema.prisma` does not show. Anyone editing the schema must read the migration files too.
- The profile tombstone breaks the database link to `auth.users`: an orphaned profile is possible if the app ever deletes an auth user outside the deletion flow.
- `parts` jsonb is tied to the AI SDK message format. A major AI SDK upgrade that changes parts needs a read time adapter or a backfill.
- `bigint` prices and `Decimal` land sizes must always pass through `serializeListing`; skipping it throws a serialization error.
- Booking and message saving use raw `on conflict` SQL rather than plain Prisma calls, which is less familiar code.
- English only listing text: the Bangla chat translates on the fly, with no human checked Bangla wording.
- Nearby places are fetched from a map API at view time, adding a provider and cost that no spec has chosen yet.

**Neutral**:
- Spec 0001's profile FK line (`ON DELETE CASCADE` to `auth.users`) is replaced by this spec's tombstone rule.
- The team learns `--create-only` migrations with appended SQL.

## Follow-up

- [ ] Update spec 0001's "Users and profiles" convention: drop the `profiles.id → auth.users(id) ON DELETE CASCADE` FK in favor of this spec's tombstone rule (AC-10), switch the role names to the uppercase enum, and make the profile insert conflict safe.
- [ ] Feature 17 spec: build the deletion flow (scrub profile, delete conversations, saved homes, AI usage, scrub lead snapshots, then delete the auth user with a retry if that call fails).
- [ ] Feature 10 or 13 spec: choose the nearby places provider (map API at view time) and its caching; check POI coverage in Sylhet.
- [ ] Feature 19 spec: add the notification outbox table (left out of this model on purpose).
- [ ] Feature 7 spec: define the per user daily cap that reads `ai_usage_daily`, and allow booking a listing that was recommended or was the conversation's `start_listing_id`.
- [ ] Feature 23 spec: decide what happens when a seller edits a PUBLISHED listing (back to review, or agent only edits).
- [ ] Feature 25 spec: refine `payments` for the chosen gateway (webhook ids, refunds) before its migration.
- [ ] Later, if fuzzy matching is needed: add a nullable `embedding vector` column with pgvector (additive).
- [ ] `/audit`: record the conventions above (snake_case mapping, UUID v7, `--create-only` raw SQL, `toTaka`) in root `AGENTS.md`, and list `prisma-orm-setup`, `prisma-client-api`, `supabase-postgres-best-practices`, and `supabase` under `## Agent skills` (project wide).
