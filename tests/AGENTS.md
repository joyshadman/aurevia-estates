# Tests (`tests`)

## Overview

Two suites. `tests/db/` runs Vitest against a throwaway local Postgres rebuilt from the migrations on every run. `tests/e2e/` runs Playwright with axe against `/styleguide`, with no real backend. No tests run in CI yet.

## Key files

| File | Owns |
|---|---|
| `db/support/global-setup.ts` | Drops and rebuilds `public`, creates the Supabase API roles, runs `migrate deploy` and the seed with `--sample` |
| `db/support/database.ts` | Test and shadow database URLs; refuses any host that is not this machine |
| `db/support/env.ts` | Placeholder env for `serverEnv()` / `publicEnv()`; disconnects `db` after each file |
| `db/support/fixtures.ts` | Builders (`createProfile`, listings, ...) with fresh ids every call |
| `db/support/mock-model.ts` | A scripted AI SDK model for assistant turns |
| `db/support/race.ts` | `raceOnRow`, forces a real row lock race for stale status tests |
| `db/support/server-only.ts` | Empty stand in for `server-only` under Vitest (aliased in `vitest.config.mts`) |

## Commands

```bash
# One time: local Postgres 17 in podman, plus the test database
podman run -d --name aurevia-shadow -e POSTGRES_PASSWORD=shadow -e POSTGRES_DB=shadow -p 54329:5432 postgres:17-alpine
podman exec aurevia-shadow createdb -U postgres aurevia_test

npm run test:db    # Vitest, needs the container running
npm run test:e2e   # Playwright, starts its own `next dev` on port 3100
```

## Conventions

- Database tests call the real `lib/server` functions with an `Actor` from `fixtures.ts`; they never mock Prisma.
- Use the fixtures for data, so tests never collide with each other or with the seed.
- Assistant tests pass a scripted model (`mock-model.ts`) through the `TurnOptions` hook; they never call OpenRouter.
- Name a test after the acceptance criterion it proves (`(AC-3)`), matching the spec.

## Gotchas

- Vitest never loads `.env.local`, so the app's database is never touched. Override only with `TEST_DATABASE_URL` / `SHADOW_DATABASE_URL`, and only to a local host.
- Files run one at a time (`fileParallelism: false`) because they share one database.
- The e2e server gets placeholder Supabase and database values, so an e2e page that reads a session or the database will fail. Keep e2e to pages that need no backend until a real test backend exists.

## Related specs

- [0002 Data model](../docs/specs/0002-data-model/index.md) (database test plan)
- [0003 Design system](../docs/specs/0003-design-system-ui-foundation/index.md) (axe and theme checks)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
