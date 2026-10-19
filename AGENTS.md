# Aurevia Estates

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Stack

- **Language / Runtime**: TypeScript (strict), Node, React 19
- **Framework**: Next.js 16 App Router, Cache Components on, `proxy.ts` instead of middleware
- **Data**: Neon Postgres via Prisma 7 (`@prisma/adapter-pg`); Supabase for Auth (`@supabase/ssr`) and Storage only
- **Key dependencies**: Zod 4, Vercel AI SDK over OpenRouter (`AI_CHAT_MODEL`, default `openai/gpt-oss-120b`), Tailwind CSS v4, `class-variance-authority`
- **Hosting**: Vercel functions in `sin1`; Neon and Supabase in Singapore too (keep regions matched)
- **Package manager**: npm

## Build approach

Tracer Bullet: build one thin, real thread through every layer first, then thicken one segment at a time, each end to end.

## Commands

```bash
npm install                          # also runs prisma generate
npm run dev                          # Neon dev branch + Supabase staging, from .env.local
npm run build
npm run lint && npm run typecheck
npm run test:db && npm run test:e2e  # see tests/AGENTS.md
npm run eval:assistant               # assistant eval gate (spec 0006)
```

## Specs

Stored in `docs/specs/`: `NNNN-title/index.md` (with `rationale.md`, `verify.md`) or `NNNN-title.md`. The feature scope lives in `docs/scope/scope.md`.

## Rules

- Layering: UI → server actions / route handlers → `lib/server` services → Prisma. `lib/domain` stays pure (no db, no `server-only`) so both sides can import it.
- Every protected read or write calls `lib/server/auth.ts` (`getCurrentUser`, `requireRole`) before Prisma. `proxy.ts` only refreshes the session cookie; it is never the security check.
- Public pages (listings, homepage, discovery) never call the auth helper or read cookies, so they stay cacheable.
- Read env only through `lib/env.ts` (public `NEXT_PUBLIC_*`) and `lib/server/env.ts` (server only); add new variables there and to `.env.example` with placeholders only.
- Mutations are server actions; route handlers only for the chat stream, webhooks, cron, and upload signing. Validate input with Zod.
- Timestamps in UTC, shown in `Asia/Dhaka`. Prices are whole taka (`BigInt`), never floats.
- UI: read `design.md` first. Role color tokens only (lint enforces it), no `dark:` theming, reuse `components/ui`, merge classes with `cn` from `lib/cn.ts`. Target WCAG 2.2 AA.
- Comments say why and cite the spec (`// spec 0002, AC-11`). Import with the `@/` alias.

## Agent skills

- [supabase](.claude/skills/supabase/): `supabase/agent-skills`, Supabase Auth, Storage, `@supabase/ssr`
- [supabase-postgres-best-practices](.claude/skills/supabase-postgres-best-practices/): `supabase/agent-skills`, Postgres schema, indexes, RLS, migrations
- [prisma-orm-setup](.claude/skills/prisma-orm-setup/): `prisma/skills`, Prisma 7 config and connections
- [prisma-client-api](.claude/skills/prisma-client-api/): `prisma/skills`, Prisma Client queries and transactions
- [ai-sdk](.claude/skills/ai-sdk/): `vercel/ai`, streaming, tools, chat UI hooks
- [vercel-react-best-practices](.claude/skills/vercel-react-best-practices/): `vercel-labs/agent-skills`, React and Next.js performance

Installed for later areas (record in their area docs once those exist): `resend` and `react-email` (notifications), `sentry-nextjs-sdk` (observability).
Declined: Neon agent skills, Neon MCP
MCP servers: supabase (connected), Next.js devtools (recommended), Sentry (recommended), PostHog (recommended)

## Context files

- [lib/server/AGENTS.md](lib/server/AGENTS.md) (service layer: auth checks, status writers, raw SQL rules, the AI assistant)
- [prisma/AGENTS.md](prisma/AGENTS.md) (schema, hand written migration SQL, RLS block, seed)
- [tests/AGENTS.md](tests/AGENTS.md) (local podman database tests and Playwright axe checks)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
