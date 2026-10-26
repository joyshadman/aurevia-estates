# Database schema and migrations (`prisma`)

## Overview

Prisma owns every table in the `public` schema of the Neon database, including Better Auth's (`sessions`, `accounts`, `verifications`, `two_factors`, `rate_limits`); `profiles` is Better Auth's user table (spec 0001, spec 0008). Better Auth's CLI only generates schema; Prisma applies it. The schema, migrations, and seed live here. The generated client goes to `lib/generated/prisma` (git ignored, built by `postinstall`).

## Key files

| File | Owns |
|---|---|
| `schema.prisma` | models, enums, indexes |
| `migrations/*/migration.sql` | the applied SQL, including rules Prisma cannot express |
| `seed.ts`, `seed-data.ts` | areas, amenities, the first fact sheet; `--sample` adds the sample agent and listings |
| `../prisma.config.ts` | migrations run over `DIRECT_URL`; loads `.env.local` then `.env` |

## Commands

```bash
npm run db:migrate    # create and apply a migration locally (prisma migrate dev)
npm run db:deploy     # apply pending migrations (prisma migrate deploy)
npm run db:seed       # areas and amenities; add `-- --sample` for demo data
npm run db:drift      # migrations vs schema; needs SHADOW_DATABASE_URL
npm run db:generate   # regenerate the client after a schema change
```

## Conventions

- Older migrations enable row level security behind a guarded `DO $$` block that does nothing on Neon. Leave those blocks as they are, and don't add them to new tables (spec 0008).
- Better Auth models keep their Prisma field names (Better Auth reads them through the adapter) and map to snake case columns with `@map`.
- Check constraints (`*_ck`), the `listing_ref_seq` sequence, and the `chat_messages.seq` identity live only in migration SQL. Read the migrations before editing the schema.
- Partial index predicates are written in the form Postgres stores them, so the drift check compares equal.
- Timestamps are `timestamptz(3)` in UTC; money is `BigInt` taka; ids are uuid v7.
- The seed is safe to rerun: reference rows are created only when missing, so agent edits survive.

## Gotchas

- The seed runs outside Next and builds its own client. It must never import a `server-only` module.
- After editing `schema.prisma`, run `npm run db:generate` before typechecking, or the client types are stale.
- `@default(now())` is filled by Prisma from the app's clock, not the database's; comparing it with SQL `now()` can be off by a few seconds (spec 0019).
- `photo_files.bytes` holds whole images: only the photo route selects it, never a list query (spec 0020).

## Agent skills

- [supabase-postgres-best-practices](../.claude/skills/supabase-postgres-best-practices/): `supabase/agent-skills`, plain Postgres rules: schema, migrations, indexes
- [neon-postgres](../.claude/skills/neon-postgres/): `neondatabase/agent-skills`, pooled vs direct URLs, migrations on Neon
- [neon-postgres-branches](../.claude/skills/neon-postgres-branches/): `neondatabase/agent-skills`, testing migrations on a branch
- [prisma-orm-setup](../.claude/skills/prisma-orm-setup/): `prisma/skills`, Prisma setup and connection troubleshooting

## Related specs

- [0002 data model](../docs/specs/0002-data-model/index.md) · [0008 sign in (auth tables)](../docs/specs/0008-better-auth-sign-in/index.md)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
