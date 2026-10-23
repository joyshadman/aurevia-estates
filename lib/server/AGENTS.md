# Server services (`lib/server`)

## Overview

The service layer every server action, route handler, and server component calls before touching data (spec 0001: UI → actions / route handlers → `lib/server` → Prisma). It owns auth, permissions, writes with their invariants, and the one mapper that turns rows into plain JSON. Pure rules shared with the client live in `lib/domain/`.

## Key files

| File | Owns |
|---|---|
| `db.ts` | the one Prisma client, a lazy singleton over `DATABASE_URL` (pool of 3) |
| `env.ts` | server env through Zod: `serverEnv()` checked at boot; `aiEnv()`, `authEnv()`, `captchaEnv()` on first use |
| `auth.ts` | `getCurrentUser()`, `requireUser`, `requireAgent` / `requireAgentAction` (the AC-8 gate), `requireFreshTwoFactor`, `requireRole()`, `completeSignIn`, `Actor`; role always from `profiles` |
| `auth-config.ts` | the one Better Auth instance (`getAuth()`): Prisma adapter, closed HTTP endpoints, session hooks, `emailOTP` and `twoFactor` plugins |
| `auth-emails.ts` | Better Auth's email callback: React Email templates through Resend, the unverified password guard |
| `auth-errors.ts` | the one table from Better Auth error codes to our `reason` values |
| `auth-limits.ts` | our auth rate limiter, the 60 second email cooldown, and the 5 wrong 2FA codes cap, all in `rate_limits` |
| `auth-request.ts` | the `AsyncLocalStorage` store that carries `next` into the email callback |
| `errors.ts` | typed errors (`NotFoundError`, `StaleStatusError`, `TurnRefusedError`, ...) |
| `listings.ts` | `serializeListing` / `toCardDTO`, search, assistant candidate search |
| `listing-status.ts`, `lead-status.ts`, `viewing-status.ts` | the only writers of each `status` column |
| `chat-store.ts` | chat message persistence (`saveMessages`, `saveServerMessage`) |
| `money.ts`, `uuid.ts` | taka and katha conversion; `uuidv7()` for raw SQL inserts |
| `report.ts` | error and event reporting through Sentry; logs only when `SENTRY_DSN` is unset |
| `agent-listings.ts` | agent listing writes: row lock, `canEditListing`, the `updated_at` conflict token |
| `bookings.ts` | booking a viewing, idempotent through partial unique indexes and `on conflict do nothing` |
| `photos.ts`, `photo-links.ts` | listing photos and the cover rule; the pasted link host and redirect check |
| `location.ts` | coordinates from pasted map links (exact Google hosts only) |
| `captcha.ts` | our own hCaptcha siteverify check, fails closed |
| `ai-usage.ts` | daily AI usage per user, counted by the `Asia/Dhaka` day |
| `tx.ts` | `inTransaction()`, so a writer can join the caller's transaction |

## Conventions

- Every file starts with `import "server-only"`. Never import `lib/server/*` from a client component.
- Check permissions here, with an `Actor` (`{ id, role }`), not in pages. Ownership misses throw `ForbiddenError`; the route maps it to a 404.
- Read env only through `env.ts`; each feature adds its own variables there and to `.env.example`.
- Prices are whole taka in `bigint`. Convert with `toTaka` / `fromTaka` at the boundary; `bigint` and `Decimal` never leave the server.
- A status column changes only through its `*-status.ts` writer, which checks the transition in a transaction.
- Comments cite the spec and AC a rule comes from (`// spec 0002, AC-7`). Keep that habit.

## Gotchas

- Raw SQL inserts must supply the id with `uuidv7()`: Prisma's `uuid(7)` default only applies to Prisma writes.
- `chat_messages.seq` is `generated always as identity`. Never write it.
- Never catch `P2002` inside a transaction; use `on conflict do nothing` instead (see `bookings.ts`).
- Writes to a conversation take its row lock first (`SELECT ... FOR UPDATE` inside `db.$transaction`).
- `db` is a Proxy that builds the client on first use, so `next build` never needs runtime secrets. Keep it that way. `getAuth()` follows the same rule.
- Page renders read the session with `refresh: false` (no writes, no cookies); actions pass `refresh: true`, which is what extends a visitor's session (spec 0008, AC-15).
- Better Auth's `revokeSessionsOnPasswordReset` also ends the current session, and `unlinkAccount` wants a session made in the last 15 minutes. Check the 1.7 source before relying on an `auth.api.*` side effect.

## Agent skills

- [prisma-client-api](../../.claude/skills/prisma-client-api/): `prisma/skills`, Prisma Client queries, filters, transactions
- [better-auth-best-practices](../../.claude/skills/better-auth-best-practices/): `better-auth/skills`, the auth instance, adapter, hooks, plugins
- [better-auth-security-best-practices](../../.claude/skills/better-auth-security-best-practices/): `better-auth/skills`, rate limits, secrets, session safety
- [two-factor-authentication-best-practices](../../.claude/skills/two-factor-authentication-best-practices/): `better-auth/skills`, the `twoFactor` plugin

## Related specs

- [0001 stack and architecture](../../docs/specs/0001-stack-architecture/index.md) · [0002 data model](../../docs/specs/0002-data-model/index.md) · [0008 sign in](../../docs/specs/0008-better-auth-sign-in/index.md) · [0005 listing management](../../docs/specs/0005-agent-listing-management/index.md)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
