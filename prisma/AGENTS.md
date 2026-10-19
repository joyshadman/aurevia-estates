# Database schema, migrations, and seed (`prisma`)

## Overview

Prisma Migrate owns the app tables in the Neon `public` schema. Supabase's `auth` and `storage` live in a different database that Prisma never touches. The seed loads reference data everywhere and sample data only outside production.

## Key files

| File | Owns |
|---|---|
| `schema.prisma` | Models and enums; the client is generated to `lib/generated/prisma` (git ignored) |
| `migrations/*/migration.sql` | The real schema, including rules the Prisma schema can't express |
| `seed.ts`, `seed-data.ts` | Areas, amenities, the first fact sheet; `--sample` adds a sample agent and listings |
| `../prisma.config.ts` | Points migrations at `DIRECT_URL`, optional `SHADOW_DATABASE_URL`, loads `.env.local` |

## Commands

```bash
npm run db:migrate   # prisma migrate dev, against the Neon dev branch (.env.local)
npm run db:drift     # schema vs migrations, exits non zero on drift (needs SHADOW_DATABASE_URL)
npm run db:seed      # reference data; add `-- --sample` for sample listings (never production)
npm run db:status    # migration status
```

## Conventions

- Some rules live only in migration SQL: `*_ck` check constraints, `listing_ref_seq`, the `chat_messages.seq` identity, partial unique indexes, and the RLS lines. Read the existing `migration.sql` files before editing the schema, and add raw SQL by hand after `prisma migrate dev --create-only`.
- Every migration that creates a table also enables row level security with no policies, then revokes all from `anon` and `authenticated` inside a guarded `DO $$` block that skips missing roles (copy the block from `20261018160339_assistant_chat`).
- Migrations must be backward compatible: add tables and nullable or defaulted columns first; drop or rename only in a later release, once no deployed code reads the old shape.
- Tables and columns are `snake_case` via `@@map` / `@map`; enums are `UPPER_CASE` with a `snake_case` `@@map`.
- Ids are UUID v7. Timestamps are `timestamptz` in UTC. Prices are whole taka as `BigInt`, never floats.
- The seed is safe to rerun: it only adds rows that are missing, so agent edits survive. It builds its own Prisma client and never imports `server-only` modules.

## Gotchas

- Never point `DIRECT_URL` at the `-pooler` host: Migrate needs a real session for advisory locks.
- The Vercel build never migrates. Deploys run `prisma migrate deploy` separately (`npm run db:deploy`; the planned GitHub Actions workflow in spec 0001 is not built yet).
- The database tests replay every migration on a fresh database, so a migration that only works on top of existing data fails there first.

## Agent skills

- [prisma-orm-setup](../.claude/skills/prisma-orm-setup/): `prisma/skills`, Prisma 7 setup, config, and connection troubleshooting
- [supabase-postgres-best-practices](../.claude/skills/supabase-postgres-best-practices/): `supabase/agent-skills`, schema design, indexes, RLS, migrations

## Related specs

- [0001 Stack and architecture](../docs/specs/0001-stack-architecture/index.md) (migrations, seeding, connection strings)
- [0002 Data model](../docs/specs/0002-data-model/index.md) (entities, constraints, state machines)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
