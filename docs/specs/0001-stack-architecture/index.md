# 0001. Stack and architecture for Aurevia Estates

**Date**: 2026-10-16 (data store amended 2026-10-18)
**Status**: In Progress

## Summary

Aurevia Estates is built as one Next.js app (a single deployable, no separate backend), hosted on Vercel in Singapore. App data lives in Neon Postgres in Singapore (a managed, serverless Postgres), and the app talks to it through Prisma. Sign in and photos stay on Supabase (Supabase Auth and Supabase Storage), so Supabase holds none of the app tables. The data store moved from Supabase Postgres to Neon on 2026-10-18, mainly to stay inside free tier limits. The AI assistant runs on the Vercel AI SDK, calling `gpt-oss-120b` through OpenRouter, so the model can be swapped later without rewriting the chat. Email goes through Resend, analytics through PostHog, errors through Sentry, and maps use MapLibre with MapTiler tiles.

## Decision

**Chosen option**: Option 1: Next.js monolith with Prisma, AI SDK over OpenRouter, on Vercel Singapore. Amended 2026-10-18: app data on Neon Postgres (Singapore), with Supabase kept for Auth and Storage only (Option 5 in the rationale).

Build the whole product as one Next.js 16 App Router app that owns its UI, server actions, and route handlers. Neon supplies the managed Postgres for app data. Supabase supplies auth and file storage. Prisma is the only path the server uses to read and write app data. Every permission check happens in server code.

**Implementation skills** (Neon skills and MCP were offered and declined on 2026-10-18): `supabase` (`supabase/agent-skills`, `.claude/skills/supabase/`) · `supabase-postgres-best-practices` (`supabase/agent-skills`, `.claude/skills/supabase-postgres-best-practices/`) · `prisma-orm-setup` (`prisma/skills`, `.claude/skills/prisma-orm-setup/`) · `prisma-client-api` (`prisma/skills`, `.claude/skills/prisma-client-api/`) · `ai-sdk` (`vercel/ai`, `.claude/skills/ai-sdk/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`) · `resend` (`resend/resend-skills`, `.claude/skills/resend/`) · `react-email` (`resend/react-email`, `.claude/skills/react-email/`) · `sentry-nextjs-sdk` (`getsentry/sentry-for-ai`, `.claude/skills/sentry-nextjs-sdk/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Proposed stack

| Layer | Choice | Reason |
|---|---|---|
| Architecture pattern | One Next.js app (a monolith), layered: UI → server actions / route handlers → `lib/server` services → Prisma | A small team with fewer than 1K users at launch. One deployable is the simplest thing to build and debug. |
| Language | TypeScript, strict mode | Already scaffolded. It gives one language across UI, server, and AI tool schemas. |
| Framework | Next.js 16 App Router, React 19 (already installed) | Already scaffolded. Server rendering suits the SEO heavy listing pages. |
| Styling | Tailwind CSS v4 (already installed) | Already scaffolded. The mockup theme maps straight onto it; tokens are decided in the design system spec. |
| Primary DB | Neon Postgres, AWS `ap-southeast-1` (Singapore), free tier at launch | Relational data in a managed Postgres next to the hosting region. Neon scales to zero without pausing the project, which keeps the free tier usable; Supabase's free tier pauses idle projects and caps you at two. |
| Data access (ORM) | Prisma ORM, current major at scaffold time (7 or later), with the `@prisma/adapter-pg` driver adapter | Your pick. A typed client for normal reads and writes; use raw SQL (`$queryRaw`) for reporting queries. |
| Migrations | Prisma Migrate owns the app tables in Neon's `public` schema. Supabase's `auth` and `storage` schemas live in a separate database that Prisma never touches. One GitHub Actions workflow runs `prisma migrate deploy` on every merge to `main`: staging first, then production. The Vercel build never migrates. Migrations must be backward compatible (see *Migrations and seeding*). | One migration tool per database, one migration path, the schema moves before the new code goes live, and unmerged migrations never land in the shared staging branch. |
| Rendering and caching | Next.js 16 Cache Components on (`cacheComponents: true`, `"use cache"` for cacheable reads) | Public listing pages stay cached and fast for SEO; each component states what it caches. |
| Auth | Supabase Auth via `@supabase/ssr`: Google sign in, email magic link, email + password | Your pick. It's built into the chosen platform, so there's no extra vendor. Sessions live in cookies that server code reads. |
| Roles and permissions | A `role` column (`visitor`, `agent`, `seller`) on an app `profiles` table keyed by the Supabase user id. Checked in server code through one shared helper. | Prisma bypasses row level security, so a single enforced helper is the one place permissions live. |
| Validation | Zod | One schema shape for forms, server actions, and AI tool inputs. The AI SDK accepts Zod directly. |
| API shape | Server actions for mutations and forms. Route handlers only for the streaming chat endpoint, webhooks, cron, and upload signing. | The native Next.js 16 way, with no extra API layer to maintain. |
| AI SDK | Vercel AI SDK (`ai`, `@ai-sdk/react`), current major at scaffold time | Streaming chat UI hooks, tool calling, and structured output, independent of the provider. |
| AI model access | OpenRouter (`@openrouter/ai-sdk-provider`), model `openai/gpt-oss-120b`, with the model id read from an env var | Your pick. One key reaches many models, and swapping is a config change. |
| AI cost control | OpenRouter account spend cap (your pick), plus `maxOutputTokens` and a max tool step limit set on every AI call | The spend cap is the backstop; per call limits stop one runaway conversation. |
| Background jobs | Next.js `after()` for work done after the response, plus Vercel Cron hitting a protected route handler that retries from a database outbox table. Built with feature 19, not in the scaffold. | No new vendor. Durable enough for email retries at this volume. On Hobby the cron runs only daily; on Pro it can run every few minutes. |
| File storage | Supabase Storage, with uploads through signed upload URLs issued by server code | Already in the project and close to the database. Files never sit in the database. |
| Email | Resend (transactional email, React Email templates). Supabase Auth emails go through the app's Send Email Hook, which sends them with Resend (spec 0004); Supabase custom SMTP stays off. | One sender domain for every email, and better deliverability and limits than Supabase's built in mailer. |
| Maps | MapLibre GL JS with MapTiler vector tiles | Open source library, a free tile tier, and OpenStreetMap coverage of Sylhet. |
| Product analytics | PostHog (cloud), started only after cookie consent | Funnel events (chat started → viewing booked) for the success metric. |
| Error tracking | Sentry (`@sentry/nextjs`), covering server and client | Catches errors from launch. |
| Hosting | Vercel, functions pinned to `sin1` (Singapore). Hobby plan while building, Pro before launch. | Built for Next.js. Singapore sits next to the database and close to Bangladesh (Vercel defaults to the US). Hobby is non commercial only, with a 60s function limit and daily crons. |
| Environments | Neon: the production project `aurevia-prod` (only its `main` branch), and the non production project `aurevia-nonprod` with a `staging` branch (shared by all Vercel previews) and a `dev` branch (local development). Both on Postgres 17, with Neon's default database and role names. Supabase: a staging project (local dev and previews) and a production project. Database tests use a throwaway local Postgres 17 in podman. | Development and previews never touch production data. Production is a different project, so no branch can ever inherit its personal data. |
| Package manager | npm (already in use, `package-lock.json`) | Already chosen by the scaffold. |
| Payments | Not decided here. Its own spec comes at feature 25 (SSLCommerz is the leading candidate). | The choice depends on your legal entity, and the feature is far off. |

## Architecture conventions (what every feature builds on)

These are part of the decision. `/develop` follows them when it scaffolds, and every feature after that follows them too.

- **Proxy, not middleware.** Next.js 16 renamed `middleware.ts` to `proxy.ts`. Use `proxy.ts` only to refresh the Supabase session cookie and to do cheap redirects. Never treat it as the security check.
- **One server only auth helper** (for example `lib/server/auth.ts`, marked `import "server-only"`). It exposes `getCurrentUser()` and `requireRole(...roles)`. Every server action, route handler, and server component that reads or writes protected data calls it before touching Prisma. It verifies the session with Supabase on the server (never trusts an unverified cookie), then loads `profiles.role`.
- **Prisma wiring (Prisma 7 or later).** `prisma.config.ts` points migrations at `DIRECT_URL`. `lib/server/db.ts` is the one Prisma client, a module level singleton built with `new PrismaPg({ connectionString: DATABASE_URL, max: 3 })` (a small pool per serverless instance). The generated client goes to `lib/generated/prisma` (git ignored). `prisma generate` runs in `postinstall` so Vercel builds always have it. The schema manages only `public`.
- **Connection strings.** `DATABASE_URL` is Neon's pooled host (the hostname with `-pooler`, which goes through Neon's PgBouncer), used at runtime through `@prisma/adapter-pg` over TCP. `DIRECT_URL` is the same branch's direct host (no `-pooler`), used only by Prisma Migrate, which needs a real session (it takes advisory locks). Both use `sslmode=verify-full`, which Neon supports and which avoids the `pg` warning about `require`. Never point `DIRECT_URL` at the pooler.
- **Pool settings.** `lib/server/db.ts` builds the pool with `max: 3`, `connectionTimeoutMillis: 10000` (the database may be waking from scale to zero, and the `pg` default waits forever), and `idleTimeoutMillis: 30000`, and attaches a `pool.on("error")` handler that logs. Neon closes idle sockets when compute suspends, and an unhandled idle client error would crash the instance.
- **Pooler rule.** The pooler runs in transaction mode, so the runtime path never uses session state: no `SET` outside a transaction (`SET LOCAL` inside one is fine), no advisory locks, no `LISTEN`/`NOTIFY`. Interactive `$transaction` is fine, because it holds one connection throughout.
- **Row level security on, deny by default (defense in depth).** Neon exposes no REST API by default, and Prisma connects as the role that owns the tables (the same role for runtime and migrations), so RLS is not the main guard; server code is. If a separate, restricted runtime role is ever added, RLS with no policies would block it, so that change needs its own decision. Every Prisma migration that creates a table still enables row level security with no policies and revokes all from `anon` and `authenticated` where those roles exist (the revoke skips roles that are missing, as on Neon). That keeps the tables closed if a data API such as Neon's is ever switched on; if one is, run the revokes again (the roles it creates did not exist when earlier migrations ran). Nothing in the browser reads tables directly.
- **Users and profiles.** Supabase `auth.users` is the identity, in a different database from the app tables. The app's `profiles` row (same uuid) holds `role` and display data. `getCurrentUser()` upserts a missing profile itself, with role `visitor`, so every sign in method works without relying on one callback. A role is never taken from client input. Agents are promoted only by an admin script. There is no foreign key between `profiles` and `auth.users` (one can't span two databases); deletion follows spec 0002's tombstone rule, and the deletion flow (feature 17) removes the auth user through the Supabase Admin API.
- **Reaching Supabase's own tables.** App code reaches Supabase only through its APIs (`@supabase/ssr`, the Admin API with the service role key). The one exception is an operator script that must delete `auth.sessions` rows (spec 0004's `mfa:reset`): it uses `SUPABASE_DB_URL`, the Supabase project's session pooler URL (port 5432, the `postgres` database user; the direct host is IPv6 only on the free tier), kept only in the git ignored `.env.staging` and `.env.production` files, never on Vercel, over its own short lived `pg` connection.
- **Operator env loading.** Commands that act on staging or production (`db:deploy`, `db:seed`, and spec 0004's scripts) take `--env staging|production` and load `.env.staging` or `.env.production` (git ignored) instead of `.env.local`; `prisma.config.ts` honors the same choice. With `--env production`, they print the target host and ask you to type `production` before acting. Without `--env`, they act on `.env.local` (the `dev` branch).
- **Local dev.** `npm run dev` runs against the Neon `dev` branch and the Supabase staging project (there is no local Supabase stack). `prisma migrate dev` applies app migrations to the `dev` branch; the podman shadow database is optional for diffing (`SHADOW_DATABASE_URL`), and `npm run db:drift` checks the schema against the migrations. `dev` is branched from `staging`, never from production; when it drifts, reset it from `staging` or run `prisma migrate reset` on it. Profiles in `dev` and `staging` both key off the same Supabase staging users; a reset leaves those users without profiles, which is fine because profiles are created lazily on the next sign in. Storage buckets and their settings are created by a setup script against each Supabase project, never by Prisma. Auth emails are real emails from the staging project, so use addresses you own.
- **Migrations and seeding.** `.github/workflows/migrate.yml` runs on every push to `main` that changes `prisma/migrations/**`: Node 24, `npm ci`, then `prisma migrate deploy` with the GitHub secret `STAGING_DIRECT_URL`, then the same with `PRODUCTION_DIRECT_URL` (production runs only if staging succeeds). The Vercel build only runs `next build`. Vercel may deploy the new code a little before the workflow finishes, which is why every migration must be backward compatible: add first (new tables, nullable or defaulted columns), and drop or rename only in a later release after no deployed code reads the old shape. A failed workflow blocks nothing automatically; fix it and rerun it before the next deploy. `db:deploy` is `prisma migrate deploy`. Seeding: `npm run db:seed` puts reference data (areas, amenities) on every environment, and `--sample` (sample listings) only on `dev` and `staging`, never on production; the seed refuses `--sample` with `--env production`.
- **Deploys and previews.** Previews use the Neon `staging` branch and the Supabase staging project, and never migrate. A PR with a schema change is tested on the `dev` branch first, so its preview may fail until it merges. The staging and production Supabase redirect URL lists, and the Google OAuth client, allow the Vercel preview wildcard (`https://*-<team>.vercel.app/**`, where `<team>` is your Vercel team slug), so email links and Google work on previews. Env vars are set by hand in Vercel, Preview values for all preview branches and Production values only on Production; the Neon Vercel integration is not used, since it creates its own branches.
- **Staging keepalive.** Supabase pauses free projects after a week idle, and the staging project backs every preview and local dev. A weekly scheduled GitHub Actions job makes one cheap request to the staging project (an Auth health call) so it never pauses.
- **Caching rule.** Public pages (listings, homepage, discovery) never call the auth helper or read cookies, so they stay cacheable. Signed in UI (chat, saved homes, dashboard) is rendered dynamically in its own components.
- **Env module.** `lib/env.ts` parses environment variables with Zod at startup, split into a server only object and a public (`NEXT_PUBLIC_*`) object. Code reads env only through it. Each feature adds its own variables there when it is built.
- **AI calls are server only.** The OpenRouter key never reaches the browser. The chat route handler streams with the AI SDK and sets `export const maxDuration` (60 on Hobby, raise it on Pro). Tools (search listings, book viewing) are Zod typed server functions that call the same services as the rest of the app, and they run the same permission checks. Every tool loop has a step limit (`stopWhen`), and every call has `maxOutputTokens`.
- **OpenRouter routing.** Requests set provider routing to `require_parameters: true` (only upstreams that support tool calls) and `allow_fallbacks: false`, with an ordered provider list. The pinned providers come from the eval in Follow-up.
- **Time and money.** Store timestamps in UTC (`timestamptz`) and display them in `Asia/Dhaka`. Store prices in BDT as whole numbers (taka, `BigInt` or `Int`), never floats.
- **Secrets.** Only `NEXT_PUBLIC_*` values may reach the client. The Supabase service role key is used only for admin tasks in server code (for example storage signing and agent promotion) and never in a client bundle.
- **Region.** The Vercel function region `sin1`, the Neon projects (AWS `ap-southeast-1`), and the Supabase projects (Singapore) must all match. A chat turn makes several queries, so a database in another region multiplies its latency.
- **Scaffold scope.** The scaffold (feature 1's execution box) installs only Supabase SSR, Prisma with the adapter, Zod, `lib/env.ts`, `lib/server/db.ts`, `lib/server/auth.ts`, and `proxy.ts`, plus Cache Components and the region config. The AI SDK, Resend, MapLibre, PostHog, Sentry, and the cron/outbox come in with the features that use them.

## Configuration required

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Supabase public (anon or publishable) key used by `@supabase/ssr`
- `SUPABASE_SERVICE_ROLE_KEY`: server only admin key, for storage signing and admin tasks
- `DATABASE_URL`: Neon pooled connection (`-pooler` host) for Prisma at runtime
- `DIRECT_URL`: Neon direct connection (no `-pooler`) for Prisma Migrate
- `SUPABASE_DB_URL`: Supabase session pooler URL (port 5432), only in the git ignored `.env.staging` and `.env.production` files for operator scripts; never set on Vercel or in `.env.local`
- `SHADOW_DATABASE_URL`, `TEST_DATABASE_URL`: optional, local podman Postgres for `prisma migrate dev` diffing and the database tests (spec 0002); both have working defaults
- `NEXT_PUBLIC_SITE_URL`: canonical origin per environment (`http://localhost:3000` locally, the preview URL on Preview, the production domain on Production), used for every redirect and email link (spec 0004)
- GitHub Actions secrets (not env): `STAGING_DIRECT_URL`, `PRODUCTION_DIRECT_URL` for the migration workflow, and the staging Supabase URL and publishable key for the keepalive
- `OPENROUTER_API_KEY`: server only key for OpenRouter
- `AI_CHAT_MODEL`: model id, default `openai/gpt-oss-120b`
- `RESEND_API_KEY`: server only key for Resend (used by the app, including the Send Email Hook)
- `EMAIL_FROM`: verified sender address on your domain
- `NEXT_PUBLIC_MAPTILER_KEY`: public MapTiler key, restricted to your domains
- `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`: PostHog project key and host
- `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`: Sentry error reporting and source map upload
- `CRON_SECRET`: shared secret that the Vercel Cron routes check
- Supabase dashboard (not env), set on both staging and production: Google OAuth client id and secret, the site URL and redirect URLs (including the preview wildcard on staging), and the Send Email Hook (custom SMTP off). Spec 0004 adds its own variables (`HCAPTCHA_SECRET`, `NEXT_PUBLIC_HCAPTCHA_SITE_KEY`, `SEND_EMAIL_HOOK_SECRET`, `AUTH_EMAIL_FROM`).

Supabase and database values differ per environment: local (Neon `dev` branch, Supabase staging project), Vercel Preview (Neon `staging` branch, Supabase staging project), Vercel Production (Neon production project, Supabase production project). Each feature adds only the variables it actually uses, when it is built (the scaffold adds only the Supabase and database ones).

## Consequences

**Positive**:
- One codebase and one deploy. The UI, server logic, and AI tools share types and Zod schemas.
- Neon, Supabase, and Vercel all sit in Singapore, close to Bangladesh.
- Neon scales to zero instead of pausing, so the free tier stays usable while building, and branches give cheap, isolated staging and dev copies.
- Supabase holds no app tables, so its two free projects are spent on auth and storage only.
- The AI model is one env var. If `gpt-oss-120b` struggles with Bangla or tool calls, switching to another model is a config change plus a re check.

**Negative / tradeoffs**:
- Prisma connects as the owner, so row level security never protects app data inside the app; any server path that forgets `requireRole` leaks data. A code review rule and tests on the auth helper are required.
- Identity and app data live in two databases from two vendors. Nothing in the database links a profile to its auth user, no single transaction or backup covers both, and an orphan on either side is possible if one call fails (spec 0002's tombstone rule and feature 17's retry handle the known paths).
- One more vendor: Neon joins Supabase, with its own console, keys, bill, and free tier limits. Two Supabase projects and two Neon projects to keep configured.
- Free tier production at launch: Neon's free plan has a short restore window and small compute, and the database sleeps when idle, so the first request after a quiet spell is slower while it wakes. There is no long term backup unless you add one.
- Supabase free projects pause after a week idle, which takes sign in down; the staging project needs the weekly keepalive, and the production Supabase project still needs Pro before launch.
- Backward compatible migrations only: removing or renaming a column takes two releases.
- No local Supabase stack: development sends real auth emails from the staging project, and testing sign in needs internet access.
- Hobby while building means a 60s chat limit and daily only crons, and it's not allowed for commercial use. Upgrading to Pro is a launch blocker.
- Spend cap only abuse control: one signed in abuser can burn the monthly AI budget and shut the assistant off for everyone until the cap resets.
- Serverless limits: chat streams must finish within Vercel's function duration limit, and runtime database connections must go through the pooler, or you'll see connection exhaustion under load.
- Many vendors (Supabase, Vercel, OpenRouter, Resend, MapTiler, PostHog, Sentry), each with its own key, bill, and free tier limit.

**Neutral**:
- The team learns the Next.js 16 `proxy.ts` convention, `after()`, and the Supabase SSR cookie flow.
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
- [x] `/audit`: pick the test runner and the test database. Vitest is in place, and the database tests use the local podman Postgres (no tests run in CI yet).
- [ ] Launch blockers: upgrade Vercel to Pro and the production Supabase project to Pro, and verify the email sending domain in Resend (SPF and DKIM) before real users sign up.

**From the 2026-10-18 data store amendment:**
- [ ] Rotate first: the Supabase service role key (it sat in the tracked `.env.example`) and any other value from that file's history. Rotation is the real fix, because git history is not scrubbed. Keep `.env.example` to placeholders only.
- [ ] Move to Singapore: create `aurevia-prod` and `aurevia-nonprod` (branch `staging` from the root branch, then `dev` from `staging`) in `ap-southeast-1` on Postgres 17. While creating them, confirm and record here the free tier limits that matter (project count, branch quota, storage, compute hours, restore window, scale to zero delay). No data is copied: run `db:deploy` on each, then `db:seed` (with `--sample` on non production only). Point `.env.local` at `dev`, write `.env.staging` and `.env.production`, set the Vercel env vars, check that nothing still points at `us-east-2`, then delete that project, which retires the leaked database password.
- [ ] Build the operator `--env` loading, the seed's production guard, the pool settings in `lib/server/db.ts`, `.github/workflows/migrate.yml`, and the weekly staging keepalive job.
- [ ] Spec 0002: rewrite the RLS check (AC-1 and its test scenario) from "the public key gets a permission error" to "every app table has RLS enabled with no policies", since Neon has no Supabase REST API; and drop "run against the local Supabase stack" from its test notes.
- [ ] Spec 0004: `mfa:reset` deletes `auth.sessions` over `SUPABASE_DB_URL` (not the Prisma connection); remove the local Supabase stack and `supabase/config.toml` assumptions, so the auth settings live only in the dashboards and `docs/runbooks/auth-config.md`.
- [ ] Spec 0004: its thin thread tests against the local Supabase inbox; with no local stack, it tests on the Supabase staging project with Resend and inboxes you own.
- [ ] Optional, before real data: a scheduled `pg_dump` of production (a GitHub Actions cron, encrypted, to storage you control, with a retention period), since the free tier restore window is short.
- [ ] Optional: a periodic check for orphans between Supabase auth users and Neon profiles (feature 17's area).
- [ ] `/audit`: record Neon (and the declined Neon skills and MCP) in root `AGENTS.md`, plus the region rule and the pooled versus direct connection rule.
