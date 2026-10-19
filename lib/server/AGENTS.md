# Server services (`lib/server`)

## Overview

The service layer every server action, route handler, and server component calls. It owns permissions, every database write, and the AI assistant. UI code never talks to Prisma directly; it calls a function here.

## Key files

| File | Owns |
|---|---|
| `auth.ts` | `getCurrentUser()`, `getSessionUser()`, `requireRole(...)`, `Actor`, `ForbiddenError` |
| `db.ts` | The one Prisma client (lazy singleton over `DATABASE_URL`, pool `max: 3`) |
| `env.ts` | Server only env, parsed with Zod; public env lives in `lib/env.ts` |
| `errors.ts` | Typed service errors (`NotFoundError`, `StaleStatusError`, `PublishBlockedError`, ...) |
| `listing-status.ts`, `lead-status.ts`, `viewing-status.ts` | The only writers of each `status` column |
| `listings.ts` | Refs, publish, search, `serializeListing` (row to plain JSON) |
| `bookings.ts`, `chat-store.ts`, `briefs.ts`, `photos.ts`, `ai-usage.ts` | Booking, chat persistence, search brief, photos and cover, daily AI usage |
| `money.ts`, `uuid.ts`, `report.ts` | `bigint` taka to number, UUID v7 for raw inserts, event and error reporting |
| `assistant/` | The chat turn (`turn.ts`), tools, model config, prompt, history, grounding |

## Conventions

- Every file starts with `import "server-only"`.
- Every function that reads or writes protected data takes an `Actor` (or calls `requireRole`) and checks it before touching Prisma. Prisma connects as the table owner, so RLS never protects you here; this check is the only guard.
- The role always comes from `profiles.role` in the database, never from the JWT or client input. A profile with `deleted_at` set counts as signed out.
- Status columns change only through the matching `transition*` function: it asserts the move with the pure rules in `lib/domain/*-status.ts`, then does a guarded `updateMany({ where: { id, status: old } })`. A count of 0 throws `StaleStatusError`. Lead and viewing changes write a `lead_activities` row in the same transaction.
- `bigint` and `Decimal` never leave the server: map rows through `serializeListing` / `toTaka` / `toKatha` before they reach React props or AI tool output.
- Raw SQL inserts must supply their own id with `uuidv7()` (Prisma's `uuid(7)` default only covers Prisma writes) and cast enums and uuids explicitly (`${id}::uuid`, `${role}::message_role`).
- Concurrency is solved in SQL: `ON CONFLICT ... DO NOTHING` on partial unique indexes, and `SELECT ... FOR UPDATE` row locks inside `$transaction`. Never catch P2002 inside a transaction.
- Report through `reportEvent` / `reportError` in `report.ts`, not bare `console` calls, so the later Sentry switch is one file.
- Functions that may run inside a caller's transaction take a `client` (or `tx`) argument defaulting to `db`.

## Gotchas

- `db` is a Proxy that builds the client on first use, so imports never need secrets (keeps `next build` working). Don't construct another `PrismaClient` in app code; `prisma/seed.ts` and tests are the only exceptions.
- The runtime goes through Neon's pooler in transaction mode: no `SET` outside a transaction (`SET LOCAL` inside is fine), no advisory locks, no `LISTEN`/`NOTIFY`.
- Assistant: the model never passes a user, conversation, or listing id; tools resolve them from the turn. The match score is computed in `lib/domain/match-score.ts`, never by the model. Every call sets `maxOutputTokens` and a step limit. Read the whole stream returned by `runAssistantTurn`, or its `done` promise never settles.
- A change to the assistant's prompt, tools, or model should pass `npm run eval:assistant` (spec 0006, AC-1). It needs `OPENROUTER_API_KEY` and a seeded `.env.local` database.

## Agent skills

- [prisma-client-api](../../.claude/skills/prisma-client-api/): `prisma/skills`, Prisma Client queries, filters, transactions
- [ai-sdk](../../.claude/skills/ai-sdk/): `vercel/ai`, `streamText`, tools, UI message streams in `assistant/`
- [supabase](../../.claude/skills/supabase/): `supabase/agent-skills`, `@supabase/ssr` sessions and `getClaims()` in `auth.ts`

## Related specs

- [0001 Stack and architecture](../../docs/specs/0001-stack-architecture/index.md) (auth helper, Prisma wiring, pooler rule)
- [0002 Data model](../../docs/specs/0002-data-model/index.md) (state machines, booking, chat store)
- [0006 AI home finder chat](../../docs/specs/0006-ai-home-finder-chat/index.md) (the assistant)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
