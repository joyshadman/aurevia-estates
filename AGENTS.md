# Aurevia Estates

## Stack

- **Language / Runtime**: TypeScript (strict), Node.js
- **Framework**: Next.js 16 App Router with Cache Components, React 19, Tailwind CSS v4
- **Data**: Neon Postgres in Ohio (`aws-us-east-2`) through Prisma 7 with `@prisma/adapter-pg`; Prisma Migrate owns every table, Better Auth's included. No storage vendor: uploaded photos go in Neon (feature 20)
- **Auth**: Better Auth 1.7 (pinned) inside the app, database sessions read on every request: Google, 6 digit email codes, email and password, TOTP 2FA, hCaptcha (spec 0008)
- **Email**: Resend with React Email templates, called from server code and Better Auth's email callback
- **AI**: Vercel AI SDK v7 over OpenRouter (`AI_CHAT_MODEL`, default `openai/gpt-oss-120b`)
- **Analytics and errors**: PostHog, loaded only after cookie consent, through `track()` in `lib/analytics.ts` (spec 0017, 0018); Sentry for errors, no user info
- **Background jobs**: emails go through `email_outbox`, written in the writer's transaction, sent with `after()`, retried by Vercel Cron at `/api/cron/outbox` (spec 0019)
- **Hosting**: Vercel, functions in `cle1` (Cleveland, beside the Neon region)
- **Package manager**: npm

Source of truth: [spec 0001](docs/specs/0001-stack-architecture/index.md).

## Build approach

**Tracer Bullet**: build one thin, real thread through every layer first, then thicken one segment at a time, each end to end.

## Commands

```bash
npm install          # also runs prisma generate
npm run dev          # dev server
npm run build        # production build
npm run typecheck    # tsc --noEmit
npm run lint         # eslint, including the raw color rule
npm run test:e2e     # Playwright + axe (no unit test runner yet)
npm run db:migrate   # and the other db:* scripts, see prisma/AGENTS.md
npm run eval:assistant   # model eval gate, see lib/server/assistant/AGENTS.md
npm run agent:promote -- <email> --env <staging|production>   # also agent:demote, mfa:reset (spec 0008)
```

## Specs

Stored in `docs/specs/`, one folder per spec: `docs/specs/NNNN-title/index.md` (the build spec), `rationale.md`, `verify.md`. The feature scope is `docs/scope/scope.md`.

## Rules

- Layers: UI → server actions (mutations) or route handlers (streaming chat, webhooks, cron, serving uploaded photos, and the Better Auth route only; uploads themselves are a server action) → `lib/server` services → Prisma.
- Auth and roles come only from `lib/server/auth.ts`, checked on the server before any data access. `proxy.ts` (not middleware) refreshes nothing: it only sends a visitor with no session cookie on `/account`, `/dashboard`, or `/assistant` to sign in, and it is never the security check.
- Public pages never read cookies or call the auth helper, so they stay cacheable. Signed in UI renders dynamically in its own components.
- Validate every input with Zod. Read env only through `lib/env.ts` (public) and `lib/server/env.ts` (server).
- UI follows [design.md](design.md): role color tokens only, no `dark:` theming, reuse `components/` before writing new markup.
- Store times in UTC and show them in `Asia/Dhaka`. Store money as whole taka, never floats.
- Comments cite the spec and AC a rule comes from (`// spec 0005, AC-13`).

## Agent skills

- [better-auth-best-practices](.claude/skills/better-auth-best-practices/): `better-auth/skills`, Better Auth config, adapters, sessions, plugins
- [better-auth-security-best-practices](.claude/skills/better-auth-security-best-practices/): `better-auth/skills`, rate limits, secrets, cookies, trusted origins
- [email-and-password-best-practices](.claude/skills/email-and-password-best-practices/): `better-auth/skills`, email verification, password reset, password rules
- [two-factor-authentication-best-practices](.claude/skills/two-factor-authentication-best-practices/): `better-auth/skills`, TOTP, backup codes, the 2FA sign in step
- [neon-postgres](.claude/skills/neon-postgres/): `neondatabase/agent-skills`, Neon connections (pooled vs direct), migrations, regions
- [neon-postgres-branches](.claude/skills/neon-postgres-branches/): `neondatabase/agent-skills`, the `main`, `staging`, `dev` branches and test branches
- [neon-postgres-egress-optimizer](.claude/skills/neon-postgres-egress-optimizer/): `neondatabase/agent-skills`, query egress and cost
- [supabase-postgres-best-practices](.claude/skills/supabase-postgres-best-practices/): `supabase/agent-skills`, plain Postgres rules (schema, indexes, queries); nothing here runs on Supabase
- [prisma-orm-setup](.claude/skills/prisma-orm-setup/): `prisma/skills`, Prisma setup and connection
- [prisma-client-api](.claude/skills/prisma-client-api/): `prisma/skills`, Prisma Client queries and transactions
- [ai-sdk](.claude/skills/ai-sdk/): `vercel/ai`, AI SDK streaming, tools, `useChat`
- [vercel-react-best-practices](.claude/skills/vercel-react-best-practices/): `vercel-labs/agent-skills`, React and Next.js performance
- [sentry-nextjs-sdk](.claude/skills/sentry-nextjs-sdk/): `getsentry/sentry-for-ai`, error reporting (`instrumentation*.ts`, `sentry.server.config.ts`, `lib/server/report.ts`)

Email skills (resend, react-email, receiving-webhooks) are listed in [app/AGENTS.md](app/AGENTS.md).
MCP servers: neon and the Better Auth docs (recommended in spec 0008, not yet configured; `.mcp.json` still holds the old supabase server); next-devtools, sentry, posthog (recommended in spec 0001).

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Context files

- [lib/server/AGENTS.md](lib/server/AGENTS.md) (the server service layer: auth, permissions, writers, raw SQL rules)
- [lib/server/assistant/AGENTS.md](lib/server/assistant/AGENTS.md) (the AI chat turn, tools, eval gate, AI SDK v7 names)
- [prisma/AGENTS.md](prisma/AGENTS.md) (schema, migrations, the auth tables, seed)
- [app/AGENTS.md](app/AGENTS.md) (routes, server actions, the agent gate, the Better Auth route)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
