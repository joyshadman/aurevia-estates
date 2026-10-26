# 0001. Stack and architecture for Aurevia Estates

**Date**: 2026-10-16
**Status**: In Progress
**Revised**: 2026-10-22, Supabase replaced by Neon Postgres and Better Auth (auth design in [spec 0008](../0008-better-auth-sign-in/index.md)); 2026-10-25, the existing Neon project in us-east-2 (Ohio) is kept and functions move to `cle1` (Cleveland) to sit beside it

## Summary

Aurevia Estates is built as one Next.js app (a single deployable, no separate backend), hosted on Vercel in Cleveland, Ohio (`cle1`). All data lives in one Neon Postgres project in AWS us-east-2 (Ohio), next door to the functions: app tables, sign in (Better Auth, an auth library that runs inside the app and keeps users and sessions in our own tables), and later uploaded photos. The app talks to the database only through Prisma. The AI assistant runs on the Vercel AI SDK, calling `gpt-oss-120b` through OpenRouter, so the model can be swapped later without rewriting the chat. Email goes through Resend, analytics through PostHog, errors through Sentry, and maps use MapLibre with MapTiler tiles.

## Decision

**Chosen option**: a variant of Option 3 (revised 2026-10-22, Prisma kept instead of Drizzle): Next.js monolith on Neon Postgres with Prisma and Better Auth, AI SDK over OpenRouter, on Vercel `cle1` beside Neon us-east-2 (revised 2026-10-25, was Singapore). (Option 1, Supabase for Postgres, Auth, and Storage, was the original choice; see rationale.md, *Revision 2026-10-22*.)

Build the whole product as one Next.js 16 App Router app that owns its UI, server actions, and route handlers. Neon supplies the managed Postgres. Better Auth runs inside the app and stores users, sessions, and codes in Neon. Prisma is the only path the server uses to read and write any table. Every permission check happens in server code.

**Implementation skills**: `neon-postgres` (`neondatabase/agent-skills`, `.claude/skills/neon-postgres/`) · `neon-postgres-branches` (`neondatabase/agent-skills`, `.claude/skills/neon-postgres-branches/`) · `better-auth-best-practices` (`better-auth/skills`, `.claude/skills/better-auth-best-practices/`) · `better-auth-security-best-practices` (`better-auth/skills`, `.claude/skills/better-auth-security-best-practices/`) · `supabase-postgres-best-practices` (`supabase/agent-skills`, `.claude/skills/supabase-postgres-best-practices/`) · `prisma-orm-setup` (`prisma/skills`, `.claude/skills/prisma-orm-setup/`) · `prisma-client-api` (`prisma/skills`, `.claude/skills/prisma-client-api/`) · `ai-sdk` (`vercel/ai`, `.claude/skills/ai-sdk/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`) · `resend` (`resend/resend-skills`, `.claude/skills/resend/`) · `react-email` (`resend/react-email`, `.claude/skills/react-email/`) · `sentry-nextjs-sdk` (`getsentry/sentry-for-ai`, `.claude/skills/sentry-nextjs-sdk/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Proposed stack

| Layer | Choice | Reason |
|---|---|---|
| Architecture pattern | One Next.js app (a monolith), layered: UI → server actions / route handlers → `lib/server` services → Prisma | A small team with fewer than 1K users at launch. One deployable is the simplest thing to build and debug. |
| Language | TypeScript, strict mode | Already scaffolded. It gives one language across UI, server, and AI tool schemas. |
| Framework | Next.js 16 App Router, React 19 (already installed) | Already scaffolded. Server rendering suits the SEO heavy listing pages. |
| Styling | Tailwind CSS v4 (already installed) | Already scaffolded. The mockup theme maps straight onto it; tokens are decided in the design system spec. |
| Primary DB | Neon Postgres, one project in `aws-us-east-2` (Ohio), the existing project (`ep-old-sunset-b5v18xop` is its first endpoint) | Relational data (listings, users, sessions, viewings) in one managed serverless database next to the hosting region. A Neon region can't be changed later; the engineer chose (2026-10-25) to keep this project instead of rebuilding in Singapore. |
| Data access (ORM) | Prisma ORM, current major at scaffold time (7 or later), with the `@prisma/adapter-pg` driver adapter | Your pick. A typed client for normal reads and writes; use raw SQL (`$queryRaw`) for reporting queries. |
| Migrations | Prisma Migrate owns every table in `public`, including Better Auth's (`sessions`, `accounts`, `verifications`, `two_factors`, `rate_limits`). Better Auth's CLI only generates the schema; Prisma applies it. `prisma migrate deploy` runs in the Vercel build for production only. | One migration tool for the whole database. |
| Rendering and caching | Next.js 16 Cache Components on (`cacheComponents: true`, `"use cache"` for cacheable reads) | Public listing pages stay cached and fast for SEO; each component states what it caches. |
| Auth | Better Auth (1.7.x, pinned) inside the app, Prisma adapter, database sessions read on every request: Google, 6 digit email codes, email + password, TOTP 2FA, hCaptcha. Design in spec 0008. | Your pick (revised). Identity lives in our own database beside the profile, with no second vendor. |
| Roles and permissions | A `role` column (`visitor`, `agent`, `seller`) on `profiles`, which is Better Auth's user table. Checked in server code through one shared helper. | One enforced helper is the one place permissions live. |
| Validation | Zod | One schema shape for forms, server actions, and AI tool inputs. The AI SDK accepts Zod directly. |
| API shape | Server actions for mutations and forms. Route handlers only for the streaming chat endpoint, webhooks, cron, and upload signing. | The native Next.js 16 way, with no extra API layer to maintain. |
| AI SDK | Vercel AI SDK (`ai`, `@ai-sdk/react`), current major at scaffold time | Streaming chat UI hooks, tool calling, and structured output, independent of the provider. |
| AI model access | OpenRouter (`@openrouter/ai-sdk-provider`), model `openai/gpt-oss-120b`, with the model id read from an env var | Your pick. One key reaches many models, and swapping is a config change. |
| AI cost control | OpenRouter account spend cap (your pick), plus `maxOutputTokens` and a max tool step limit set on every AI call | The spend cap is the backstop; per call limits stop one runaway conversation. |
| Background jobs | Next.js `after()` for work done after the response, plus Vercel Cron hitting a protected route handler that retries from a database outbox table. Built with feature 19, not in the scaffold. | No new vendor. Durable enough for email retries at this volume. On Hobby the cron runs only daily; on Pro it can run every few minutes. |
| File storage | Neon. Uploaded listing photos (feature 20) are resized on upload to WebP at most 2000px wide, stored as `bytea` in their own `photo_files` table, and served by a route handler with long immutable cache headers. Pasted photo links (spec 0005) need no storage. | Your pick (revised): no storage vendor. Resizing keeps each photo near 300 KB, and the CDN serves repeat requests. |
| Email | Resend (transactional email, React Email templates), called directly from server code, including Better Auth's email callback. | One sender domain for every email. |
| Maps | MapLibre GL JS with MapTiler vector tiles | Open source library, a free tile tier, and OpenStreetMap coverage of Sylhet. |
| Product analytics | PostHog (cloud), started only after cookie consent | Funnel events (chat started → viewing booked) for the success metric. |
| Error tracking | Sentry (`@sentry/nextjs`), covering server and client | Catches errors from launch. |
| Hosting | Vercel, functions pinned to `cle1` (Cleveland, Ohio). Hobby plan while building, Pro before launch. | Built for Next.js. `cle1` sits in the same metro as Neon us-east-2, so each of the several database reads per signed in request takes a millisecond or two. Visitors in Bangladesh pay one round trip of roughly 250 ms per request instead. Hobby is non commercial only, with a 60s function limit and daily crons. |
| Environments | One Neon project with branches: `main` (production), `staging` (shared by all Vercel preview deployments), and a `dev` branch per developer; e2e runs may use a throwaway branch. | Your pick (revised). Branches copy instantly and the free plan allows 10. Development and previews never touch production data. |
| Package manager | npm (already in use, `package-lock.json`) | Already chosen by the scaffold. |
| Payments | Not decided here. Its own spec comes at feature 25 (SSLCommerz is the leading candidate). | The choice depends on your legal entity, and the feature is far off. |

## Architecture conventions (what every feature builds on)

These are part of the decision. `/develop` follows them when it scaffolds, and every feature after that follows them too.

- **Proxy, not middleware.** Next.js 16 renamed `middleware.ts` to `proxy.ts`. Use `proxy.ts` only for cheap redirects based on whether a Better Auth session cookie exists (`getSessionCookie`). Never treat it as the security check.
- **One server only auth helper** (for example `lib/server/auth.ts`, marked `import "server-only"`). It exposes `getCurrentUser()` and `requireRole(...roles)`. Every server action, route handler, and server component that reads or writes protected data calls it before touching Prisma. It reads the session from the database with Better Auth's `auth.api.getSession()` (never trusts a cookie alone), then loads `profiles.role`.
- **Better Auth wiring.** One instance in `lib/server/auth-config.ts`, mounted at `/api/auth/[...all]`, called from server actions through `auth.api.*` with the `nextCookies()` plugin. Its config, plugins, and hooks are in spec 0008.
- **Prisma wiring (Prisma 7 or later).** `prisma.config.ts` points migrations at `DIRECT_URL`. `lib/server/db.ts` is the one Prisma client, a module level singleton built with `new PrismaPg({ connectionString: DATABASE_URL, max: 3 })` (a small pool per serverless instance). The generated client goes to `lib/generated/prisma` (git ignored). `prisma generate` runs in `postinstall` so Vercel builds always have it. The schema manages `public`, which holds every table. The driver stays `@prisma/adapter-pg` over TCP to Neon's pooler (Vercel functions run on Node); `@prisma/adapter-neon` is the runner up if connection setup time ever shows in traces.
- **Connection strings.** `DATABASE_URL` is the Neon pooled host (the `-pooler` suffix), used at runtime. `DIRECT_URL` is the Neon direct host (same host without `-pooler`), used by migrations. Each Neon branch has its own pair.
- **No browser data access.** Neon exposes no public REST API by default, and nothing in the browser reads tables directly. The guarded row level security blocks in the first migrations stay (they do nothing on Neon); new tables don't add them. If Neon's Data API is ever turned on, revisit this.
- **Users and profiles.** `profiles` is Better Auth's user table (spec 0008): `role` and display data live on the identity row itself, so there is no second identity table and no cross schema foreign key. Better Auth creates the row at first sign in with role `visitor`. A role is never taken from client input (`input: false`). Agents are promoted only by an operator script.
- **Local dev.** Each developer points `.env.local` at their own Neon `dev` branch. `prisma migrate dev` applies migrations there, and `npm run db:seed -- --sample` loads demo data. Auth emails go through Resend's test mode or a test domain; hCaptcha uses its test keys. No Docker is needed.
- **Deploys and previews.** Production builds run `prisma migrate deploy` against `main`. Preview builds use the `staging` branch, migrated the same way. Google redirect URIs accept no wildcards, so staging runs on one fixed domain (a Vercel alias) that is its `NEXT_PUBLIC_SITE_URL`, Better Auth `baseURL`, and Google redirect; other preview deployments use email and password sign in only (spec 0008).
- **Photos in the database.** Uploaded photo bytes live only in `photo_files` (never in `listing_photos` or any table that list queries read), are resized to WebP at most 2000px wide before storing, and are served by one route handler with `Cache-Control: public, max-age=31536000, immutable` and a content hash in the URL. Neon's free plan holds 1 GB, so watch storage as listings grow (about 300 KB per photo).
- **Caching rule.** Public pages (listings, homepage, discovery) never call the auth helper or read cookies, so they stay cacheable. Signed in UI (chat, saved homes, dashboard) is rendered dynamically in its own components.
- **Env module.** `lib/env.ts` parses environment variables with Zod at startup, split into a server only object and a public (`NEXT_PUBLIC_*`) object. Code reads env only through it. Each feature adds its own variables there when it is built.
- **AI calls are server only.** The OpenRouter key never reaches the browser. The chat route handler streams with the AI SDK and sets `export const maxDuration` (60 on Hobby, raise it on Pro). Tools (search listings, book viewing) are Zod typed server functions that call the same services as the rest of the app, and they run the same permission checks. Every tool loop has a step limit (`stopWhen`), and every call has `maxOutputTokens`.
- **OpenRouter routing.** Requests set provider routing to `require_parameters: true` (only upstreams that support tool calls) and `allow_fallbacks: false`, with an ordered provider list. The pinned providers come from the eval in Follow-up.
- **Time and money.** Store timestamps in UTC (`timestamptz`) and display them in `Asia/Dhaka`. Store prices in BDT as whole numbers (taka, `BigInt` or `Int`), never floats.
- **Secrets.** Only `NEXT_PUBLIC_*` values may reach the client. `BETTER_AUTH_SECRET` signs cookies and encrypts 2FA secrets; it is set once per environment and never rotated casually (rotation signs everyone out and breaks stored 2FA secrets).
- **Region.** The Vercel function region `cle1` and the Neon project region (`aws-us-east-2`, Ohio) must match. Never pin functions near the visitor and away from the database: every request reads the session from Neon, so a far database costs a round trip per query.
- **Scaffold scope.** The scaffold (feature 1's execution box) installs only Prisma with the adapter, Zod, `lib/env.ts`, `lib/server/db.ts`, `lib/server/auth.ts`, and `proxy.ts`, plus Cache Components and the region config. Better Auth arrives with spec 0008. The AI SDK, Resend, MapLibre, PostHog, Sentry, and the cron/outbox come in with the features that use them.

## Configuration required

- `DATABASE_URL`: Neon pooled connection (`-pooler` host) for Prisma at runtime
- `DIRECT_URL`: Neon direct connection for Prisma Migrate
- `BETTER_AUTH_SECRET`: server only, 32 or more random bytes, signs sessions and encrypts 2FA secrets
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: server only, the Google OAuth client per environment
- `OPENROUTER_API_KEY`: server only key for OpenRouter
- `AI_CHAT_MODEL`: model id, default `openai/gpt-oss-120b`
- `RESEND_API_KEY`: server only key for Resend
- `EMAIL_FROM`: verified sender address on your domain
- `NEXT_PUBLIC_MAPTILER_KEY`: public MapTiler key, restricted to your domains
- `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`: PostHog project key and host
- `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`: Sentry error reporting and source map upload
- `CRON_SECRET`: shared secret that the Vercel Cron routes check
- Google Cloud console (not env), per environment: the OAuth consent screen and the redirect URI `<site>/api/auth/callback/google` (plus the preview pattern on staging)

Database and auth values differ per environment: each developer's `dev` branch, Vercel Preview (`staging` branch), Vercel Production (`main` branch). Each feature adds only the variables it actually uses, when it is built (the scaffold adds only the database ones).

## Consequences

**Positive**:
- One codebase and one deploy. The UI, server logic, and AI tools share types and Zod schemas.
- One database (Neon, Ohio) holds everything, including users and sessions, under one migration tool; branches give every developer and preview its own copy without Docker.
- The AI model is one env var. If `gpt-oss-120b` struggles with Bangla or tool calls, switching to another model is a config change plus a re check.

**Negative / tradeoffs**:
- Permissions live only in server code: any server path that forgets `requireRole` leaks data. A code review rule and tests on the auth helper are required.
- We operate auth ourselves (Better Auth in our code and database): password hashing, sessions, and 2FA secrets are our responsibility, with no vendor audit log, and library upgrades need a test run.
- Photos in Postgres count against Neon's storage (1 GB on the free plan) and its egress, so feature 20 must resize, and a paid plan comes sooner than with object storage.
- Hobby while building means a 60s chat limit and daily only crons, and it's not allowed for commercial use. Upgrading to Pro is a launch blocker.
- Spend cap only abuse control: one signed in abuser can burn the monthly AI budget and shut the assistant off for everyone until the cap resets.
- Serverless limits: chat streams must finish within Vercel's function duration limit, and database connections must go through the pooler, or you'll see connection exhaustion under load.
- App and data run in the US, far from Bangladesh (revised 2026-10-25): every page and action pays one round trip of roughly 250 ms, and the first chat token arrives that much later (tokens after it stream at normal speed). Moving closer later means a new Neon project and a data copy, since a Neon region is fixed.
- Many vendors (Neon, Vercel, OpenRouter, Resend, MapTiler, PostHog, Sentry, hCaptcha), each with its own key, bill, and free tier limit.

**Neutral**:
- The team learns the Next.js 16 `proxy.ts` convention, `after()`, Better Auth's plugins and hooks, and Neon branching.
- Payments, search beyond Postgres, and SMS stay undecided until their features.

## Follow-up

- [ ] Before the AI chat spec (feature 7), run a small eval of `gpt-oss-120b` via OpenRouter on Bangla replies and on tool calling (searching listings, booking). Pin a reliable OpenRouter upstream provider if quality varies between providers.
- [ ] Revisit abuse control in the AI chat spec (feature 7). A per user daily message counter in Postgres costs no new vendor and protects the shared spend cap.
- [ ] `/audit` should record these conventions in root `AGENTS.md`: the layering, the auth helper rule, the Prisma client singleton, `proxy.ts`, and the region pinning.
- [ ] `/audit` should list the installed skills in the root `AGENTS.md` `## Agent skills` section. Supabase, Prisma, AI SDK, and React best practices are project wide. Resend and react-email belong in the notifications area doc, and Sentry in observability.
- [ ] MCP servers you chose to connect (a user config step): Supabase (`claude mcp add supabase --transport http https://mcp.supabase.com/mcp`), Next.js devtools (`npx -y next-devtools-mcp@latest`), Sentry (`claude mcp add --transport http sentry https://mcp.sentry.dev/mcp`), PostHog (`npx @posthog/wizard mcp add`). `/audit` records them on the `MCP servers:` line.
- [ ] Skills skipped for now (not declined): PostHog instrumentation (`posthog/posthog-for-claude`) and MapLibre (`maplibre/maplibre-agent-skills`). Offer them again when features 18 and 13 are designed.
- [ ] Payment gateway: decide in feature 25's own spec. Note that Stripe is generally not open to Bangladesh registered businesses.
- [ ] Data model spec (feature 3): decide how chat messages are stored (AI SDK message parts as JSON vs flat text). It's painful to migrate later.
- [ ] AI chat spec (feature 7): save the user message before streaming, save the assistant message on finish (`onFinish` or `after()`), and handle a closed tab mid reply.
- [ ] Sign in spec (feature 5): decide sign up friction (email confirmation, Supabase auth rate limits, optionally a captcha such as Turnstile), so throwaway accounts can't drain the AI budget.
- [ ] `/audit`: pick the test runner, and use the local Supabase stack as the test database.
- [ ] Launch blockers: upgrade Vercel to Pro, and verify the email sending domain in Resend (SPF and DKIM) before real users sign up.
- [ ] ~~Revision 2026-10-22: create the Neon project in `aws-ap-southeast-1`~~ Replaced 2026-10-25: keep the us-east-2 project; make sure it has `main`, `staging`, and `dev` branches; set `vercel.json` `regions` to `["cle1"]` (spec 0008, *Migration plan*).
- [ ] Revision 2026-10-22: the Supabase MCP line above no longer applies; connect Neon (`npx neon@latest mcp`) and Better Auth docs (`npx auth@latest mcp --claude-code`) instead. `/sync` updates `AGENTS.md` (stack, skills, MCP servers).
- [ ] Revision 2026-10-22: the earlier items naming the local Supabase stack, Supabase SMTP, and Supabase Storage are replaced by Neon branches, Resend from server code, and `photo_files` in Neon.
