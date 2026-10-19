# 0002. Core data model: rationale

## Context

> ⚠️ Premise note: soft delete is usually the wrong default: it leaves ghost rows, breaks unique constraints, and quietly keeps personal data. Here it is narrowed to a tombstone: the profile row stays only so leads keep a valid reference, every personal field is cleared, and chats are hard deleted. That keeps the privacy promise of feature 17 while protecting the agency's lead history.

Aurevia Estates is one Next.js app on Supabase Postgres, with Prisma owning the `public` schema (spec 0001). Every slice in the scope reads and writes the same core records: profiles with roles, listings, chats, viewings, and leads. Later slices add saved homes, seller review, and paid featuring. The scope's done condition for this feature is that those can all be supported without a breaking migration.

The forces:
- **The AI must never invent or mismatch a home.** The search tool needs exact, filterable listing attributes (area, price, type, beds, size, amenities).
- **Four property types with different attributes.** Apartments have floors, houses have land in katha, plots have no rooms.
- **Chats must reload exactly**, including tool results and listing cards, and agents must read them from a lead.
- **Leads come from several sources** (chat booking, contact form, listing inquiry) and must land in one inbox.
- **Personal data and deletion.** Accounts hold names, phones, and chats; feature 17 promises deletion of the account and chats.
- **Tracer Bullet delivery.** Slice 1 should ship a thin real thread fast, without designing later tables twice.
- **A small team** with fewer than 1K users at launch; simple beats clever.

## Options considered

### Option 1: Core columns plus a `jsonb` attributes bag

Common fields as columns, type specific fields (floor, land size, parking) in one `jsonb` column; amenities as a `text[]` of codes; one migration for everything.

**Pros**: fewest columns; new attributes need no migration.
**Cons**: filters on jsonb are weaker and harder to index; Prisma loses type safety on those fields; the AI search tool has to build jsonb queries; label changes need a deploy.

### Option 2: One relational model with typed columns and per slice additive migrations (chosen)

Typed nullable columns per attribute, lookup tables for areas and amenities, one row per chat message with `parts` jsonb, `Lead` parent of `Viewing`, the whole target designed now and migrated in four additive steps.

**Pros**: exact indexed filters; full Prisma types; areas and amenities editable without a deploy; later slices only add tables.
**Cons**: a wide nullable listings table; type rules live in Zod, not the database; several constraints are raw SQL.

### Option 3: A table per property type

`listings` plus `apartment_details`, `house_details`, `plot_details`, `commercial_details`.

**Pros**: the database enforces each type's required fields.
**Cons**: every search and card query joins four tables; changing a listing's type means moving rows; much more code for a small team.

### Option 4: Model slice 1 only

Design users, listings, chat, viewings, and leads now; design the rest when their slices arrive.

**Pros**: fastest to start; no speculative tables.
**Cons**: seller ownership, review states, and payments touch `listings` and `leads`; designing them later risks reshaping slice 1 tables with live data.

## Rationale

Option 2 fits the strongest force: the assistant must match homes exactly. Plain typed columns give Postgres real indexes and give the AI tool a simple, auditable query, so it cannot return a home over budget or in the wrong area. That rules out Option 1. Option 3 would push that safety into the database, but at a join cost on every page for a team of one or two, and a Zod schema per type gives the same rejection at the point of entry.

Designing the full target while migrating per slice answers both Tracer Bullet and the scope's "no breaking migration" condition. The parts of later slices that touch slice 1 tables are already in place: `created_by_id` and `assigned_agent_id`, the full review status enum, the lead source enum. So slices 5 and 6 only add tables. That is the gap Option 4 leaves open.

The smaller calls follow from the same forces. Areas and amenities are tables so agents can add them without a deploy, and Bangla area names help the assistant match "উপশহর". Chat parts are stored as is because reloading tool output is a requirement and the parts format is what the AI SDK reads back. Lead as the parent of Viewing gives one inbox for every source and allows reschedules. UUID v7 keys are time ordered (good for indexes) and not guessable (they don't leak counts), with a short `AUR-` reference for phone calls.

### Decisions made during writing

- **App generated UUID v7** (Prisma `uuid(7)`) over a database extension: it needs no Postgres extension on Supabase. The runner up is native `uuidv7()` once the project runs Postgres 18. The cost: raw SQL inserts must supply ids.
- **Coordinates as `double precision`** over `decimal(9,6)`: map libraries want plain numbers, and Prisma `Decimal` objects add conversion noise. Precision is far beyond what a map pin needs.
- **Ref code read from a sequence by the app** (`nextListingRef`) over a database default: the slug needs the ref code at insert time, and a two step insert then update would be worse.
- **No FK from `profiles` to `auth.users`**: a tombstone profile must survive deletion of the auth user, and a primary key cannot be set to null. The runner up, keeping the FK and never deleting auth users, leaves a sign in identity behind after deletion.
- **Area and amenity id arrays without FKs** in `search_briefs`: those rows are never hard deleted, and a join table per brief filter adds writes on every chat turn for no real safety gain.
- **Exclusion constraint for featured overlap** over a check in service code: two concurrent payments could both pass a service check; the database constraint cannot be raced.
- **Recommendations written with the assistant message on finish**: this keeps the FK to `chat_messages` valid, because the assistant message does not exist while the tool is still streaming.
- **`leads.anonymized_at` marks a scrubbed lead** (update, 2026-10-18). The first version required every lead to keep a phone or an email (`leads_contact_ck`) while the AC-10 scrub cleared both, so the scrub could never run; `/develop` found this while building. An explicit nullable timestamp lets the contact check tell "anonymized on purpose" from "contact missing by mistake", and a second check (`leads_anonymized_ck`) proves an anonymized lead really holds no visitor, phone, or email. Runners up: matching `contact_name = 'Deleted user'` with no visitor (no new column, but it ties a database rule to a display string and is easy to fake), and dropping the check (the database would no longer guarantee an agent can reach a live lead).
