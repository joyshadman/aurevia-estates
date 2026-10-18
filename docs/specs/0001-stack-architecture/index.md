# 0001. Stack and architecture for Aurevia Estates

**Date**: 2026-10-16
**Status**: In Progress

## Summary

Aurevia Estates is built as one Next.js app (a single deployable, no separate backend), hosted on Vercel in Singapore. Data, sign in, and photos live in one Supabase project (managed Postgres, Supabase Auth, Supabase Storage), and the app talks to the database through Prisma. The AI assistant runs on the Vercel AI SDK, calling `gpt-oss-120b` through OpenRouter, so the model can be swapped later without rewriting the chat. Email goes through Resend, analytics through PostHog, errors through Sentry, and maps use MapLibre with MapTiler tiles.

## Decision

**Chosen option**: Option 1: Next.js monolith on Supabase (Postgres, Auth, Storage) with Prisma, AI SDK over OpenRouter, on Vercel Singapore.

Build the whole product as one Next.js 16 App Router app that owns its UI, server actions, and route handlers. Supabase supplies the managed Postgres, auth, and file storage. Prisma is the only path the server uses to read and write app data. Every permission check happens in server code.

**Implementation skills**: `supabase` (`supabase/agent-skills`, `.claude/skills/supabase/`) · `supabase-postgres-best-practices` (`supabase/agent-skills`, `.claude/skills/supabase-postgres-best-practices/`) · `prisma-orm-setup` (`prisma/skills`, `.claude/skills/prisma-orm-setup/`) · `prisma-client-api` (`prisma/skills`, `.claude/skills/prisma-client-api/`) · `ai-sdk` (`vercel/ai`, `.claude/skills/ai-sdk/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`) · `resend` (`resend/resend-skills`, `.claude/skills/resend/`) · `react-email` (`resend/react-email`, `.claude/skills/react-email/`) · `sentry-nextjs-sdk` (`getsentry/sentry-for-ai`, `.claude/skills/sentry-nextjs-sdk/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Proposed stack

| Layer | Choice | Reason |
|---|---|---|
| Architecture pattern | One Next.js app (a monolith), layered: UI → server actions / route handlers → `lib/server` services → Prisma | A small team with fewer than 1K users at launch. One deployable is the simplest thing to build and debug. |
| Language | TypeScript, strict mode | Already scaffolded. It gives one language across UI, server, and AI tool schemas. |
| Framework | Next.js 16 App Router, React 19 (already installed) | Already scaffolded. Server rendering suits the SEO heavy listing pages. |
| Styling | Tailwind CSS v4 (already installed) | Already scaffolded. The mockup theme maps straight onto it; tokens are decided in the design system spec. |
| Primary DB | Supabase Postgres, Singapore region | Relational data (listings, users, viewings) in a managed database next to the hosting region, with auth and storage in the same project. |
| Data access (ORM) | Prisma ORM, current major at scaffold time (7 or later), with the `@prisma/adapter-pg` driver adapter | Your pick. A typed client for normal reads and writes; use raw SQL (`$queryRaw`) for reporting queries. |
| Migrations | Prisma Migrate owns the app tables in the `public` schema only. Supabase owns its own `auth` and `storage` schemas. `prisma migrate deploy` runs in the Vercel build for production only. | One migration tool per schema avoids two systems fighting over the same tables. |
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
| Email | Resend (transactional email, React Email templates). Also configured as the custom SMTP for Supabase Auth emails (magic links). | One sender domain for every email, and better deliverability and limits than Supabase's built in mailer. |
| Maps | MapLibre GL JS with MapTiler vector tiles | Open source library, a free tile tier, and OpenStreetMap coverage of Sylhet. |
| Product analytics | PostHog (cloud), started only after cookie consent | Funnel events (chat started → viewing booked) for the success metric. |
| Error tracking | Sentry (`@sentry/nextjs`), covering server and client | Catches errors from launch. |
| Hosting | Vercel, functions pinned to `sin1` (Singapore). Hobby plan while building, Pro before launch. | Built for Next.js. Singapore sits next to the database and close to Bangladesh (Vercel defaults to the US). Hobby is non commercial only, with a 60s function limit and daily crons. |
| Environments | Local (Supabase CLI in Docker), staging (a small second Supabase project shared by all Vercel preview deployments), production (its own Supabase project) | Development and previews never touch production data. |
| Package manager | npm (already in use, `package-lock.json`) | Already chosen by the scaffold. |
| Payments | Not decided here. Its own spec comes at feature 25 (SSLCommerz is the leading candidate). | The choice depends on your legal entity, and the feature is far off. |

## Architecture conventions (what every feature builds on)

These are part of the decision. `/develop` follows them when it scaffolds, and every feature after that follows them too.

- **Proxy, not middleware.** Next.js 16 renamed `middleware.ts` to `proxy.ts`. Use `proxy.ts` only to refresh the Supabase session cookie and to do cheap redirects. Never treat it as the security check.
- **One server only auth helper** (for example `lib/server/auth.ts`, marked `import "server-only"`). It exposes `getCurrentUser()` and `requireRole(...roles)`. Every server action, route handler, and server component that reads or writes protected data calls it before touching Prisma. It verifies the session with Supabase on the server (never trusts an unverified cookie), then loads `profiles.role`.
- **Prisma wiring (Prisma 7 or later).** `prisma.config.ts` points migrations at `DIRECT_URL`. `lib/server/db.ts` is the one Prisma client, a module level singleton built with `new PrismaPg({ connectionString: DATABASE_URL, max: 3 })` (a small pool per serverless instance). The generated client goes to `lib/generated/prisma` (git ignored). `prisma generate` runs in `postinstall` so Vercel builds always have it. The schema manages only `public`.
- **Connection strings.** `DATABASE_URL` is the Supabase transaction pooler (port 6543), used at runtime. `DIRECT_URL` is the Supabase session pooler (port 5432), used by migrations. It's not the direct `db.<ref>.supabase.co` host, which is IPv6 only and unreachable from Vercel builds. Locally, both point at the Supabase CLI database (port 54322).
- **Row level security on, deny by default.** Supabase exposes `public` through its REST API with the public key. Every Prisma migration that creates a table also enables row level security with no policies, and the `anon` and `authenticated` roles get no grants on app tables. Prisma connects as a privileged role, so it is unaffected. Nothing in the browser reads tables directly.
- **Users and profiles.** Supabase `auth.users` is the identity. The app's `profiles` row (same uuid) holds `role` and display data. `getCurrentUser()` upserts a missing profile itself, with role `visitor`, so every sign in method works without relying on one callback. A role is never taken from client input. Agents are promoted only by a seed or admin script that uses the service role. A raw SQL line in the migration adds a foreign key from `profiles.id` to `auth.users(id)` `ON DELETE CASCADE`, so deleting an auth user removes its profile.
- **Local dev.** `supabase start` runs the local stack. `prisma migrate dev` applies app migrations. Storage buckets and their settings come from `supabase/config.toml` (or a setup script), never from Prisma. `supabase db reset` is not the migration path for app tables. Auth emails go to the local inbox the CLI provides, with no SMTP needed.
- **Deploys and previews.** Production builds run `prisma migrate deploy` against production. Preview builds use the staging project, migrated the same way. Staging and production Supabase redirect URL lists, and the Google OAuth client, allow the Vercel preview wildcard (`https://*-<team>.vercel.app/**`), so magic links and Google work on previews.
- **Caching rule.** Public pages (listings, homepage, discovery) never call the auth helper or read cookies, so they stay cacheable. Signed in UI (chat, saved homes, dashboard) is rendered dynamically in its own components.
- **Env module.** `lib/env.ts` parses environment variables with Zod at startup, split into a server only object and a public (`NEXT_PUBLIC_*`) object. Code reads env only through it. Each feature adds its own variables there when it is built.
- **AI calls are server only.** The OpenRouter key never reaches the browser. The chat route handler streams with the AI SDK and sets `export const maxDuration` (60 on Hobby, raise it on Pro). Tools (search listings, book viewing) are Zod typed server functions that call the same services as the rest of the app, and they run the same permission checks. Every tool loop has a step limit (`stopWhen`), and every call has `maxOutputTokens`.
- **OpenRouter routing.** Requests set provider routing to `require_parameters: true` (only upstreams that support tool calls) and `allow_fallbacks: false`, with an ordered provider list. The pinned providers come from the eval in Follow-up.
- **Time and money.** Store timestamps in UTC (`timestamptz`) and display them in `Asia/Dhaka`. Store prices in BDT as whole numbers (taka, `BigInt` or `Int`), never floats.
- **Secrets.** Only `NEXT_PUBLIC_*` values may reach the client. The Supabase service role key is used only for admin tasks in server code (for example storage signing and agent promotion) and never in a client bundle.
- **Region.** The Vercel function region `sin1` and the Supabase project region (Singapore) must match.
- **Scaffold scope.** The scaffold (feature 1's execution box) installs only Supabase SSR, Prisma with the adapter, Zod, `lib/env.ts`, `lib/server/db.ts`, `lib/server/auth.ts`, and `proxy.ts`, plus Cache Components and the region config. The AI SDK, Resend, MapLibre, PostHog, Sentry, and the cron/outbox come in with the features that use them.

## Configuration required

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Supabase public (anon or publishable) key used by `@supabase/ssr`
- `SUPABASE_SERVICE_ROLE_KEY`: server only admin key, for storage signing and admin tasks
- `DATABASE_URL`: pooled Postgres connection for Prisma at runtime
- `DIRECT_URL`: direct Postgres connection for Prisma Migrate
- `OPENROUTER_API_KEY`: server only key for OpenRouter
- `AI_CHAT_MODEL`: model id, default `openai/gpt-oss-120b`
- `RESEND_API_KEY`: server only key for Resend (also entered as the SMTP password in Supabase Auth settings)
- `EMAIL_FROM`: verified sender address on your domain
- `NEXT_PUBLIC_MAPTILER_KEY`: public MapTiler key, restricted to your domains
- `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`: PostHog project key and host
- `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`: Sentry error reporting and source map upload
- `CRON_SECRET`: shared secret that the Vercel Cron routes check
- Supabase dashboard (not env), set on both staging and production: Google OAuth client id and secret, the site URL and redirect URLs (including the preview wildcard on staging), and custom SMTP pointing at Resend

Supabase and database values differ per environment: local (CLI), Vercel Preview (staging project), Vercel Production (production project). Each feature adds only the variables it actually uses, when it is built (the scaffold adds only the Supabase and database ones).

## Consequences

**Positive**:
- One codebase and one deploy. The UI, server logic, and AI tools share types and Zod schemas.
- Supabase covers database, auth, and storage in one place, close to Bangladesh, with a free local stack for development.
- The AI model is one env var. If `gpt-oss-120b` struggles with Bangla or tool calls, switching to another model is a config change plus a re check.

**Negative / tradeoffs**:
- Prisma bypasses Supabase row level security. Deny by default RLS only blocks the public REST API; inside the app, any server path that forgets `requireRole` leaks data. A code review rule and tests on the auth helper are required.
- Supabase Auth keeps users in the `auth` schema while Prisma owns `public`. The foreign key between them lives in raw SQL that Prisma's schema file does not show.
- Three Supabase projects' worth of settings to keep in sync (local config, staging, production), and staging costs a second project slot.
- Hobby while building means a 60s chat limit and daily only crons, and it's not allowed for commercial use. Upgrading to Pro is a launch blocker.
- Spend cap only abuse control: one signed in abuser can burn the monthly AI budget and shut the assistant off for everyone until the cap resets.
- Serverless limits: chat streams must finish within Vercel's function duration limit, and database connections must go through the pooler, or you'll see connection exhaustion under load.
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
- [ ] `/audit`: pick the test runner, and use the local Supabase stack as the test database.
- [ ] Launch blockers: upgrade Vercel to Pro, and verify the email sending domain in Resend (SPF and DKIM) before real users sign up.
