# 0001. Stack and architecture: rationale

Decision record for [index.md](index.md). `/develop` does not need to read this.

## Context

> ⚠️ Premise note: two of the picks carry known risks you are choosing to accept. (1) `gpt-oss-120b` is an open weight model served by many different OpenRouter upstream providers, whose tool calling reliability and Bangla quality vary. The assistant's core promise ("never invent a listing, book correctly") rests on both, so it needs a small eval before the chat spec locks in. (2) An account level spend cap alone means a single abusive user can exhaust the AI budget for everyone. Neither blocks the stack. Both are tracked as Follow-up for the AI chat spec (feature 7).

Aurevia Estates is a curated luxury real estate agency site for Sylhet, Bangladesh, serving local buyers and families abroad. The core loop is: a signed in visitor chats with an AI assistant (English or Bangla), the assistant matches them to hand checked listings stored in the database, books a viewing, and an agent follows up from a lead inbox. Later slices add public discovery pages (SEO matters), photo uploads, maps, email notifications, outside sellers, and paid featured listings (`docs/scope/scope.md`). The success metric is viewings booked through the assistant (basis: `docs/scope/scope.md` header).

Forces that shaped the stack:
- **Already scaffolded:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, npm (basis: `package.json`). The decision builds on that, not around it.
- **Team and scale:** a small team, under 1K users at launch, a single region audience in South Asia. Simplicity and low ops cost beat scale features (basis: monolith first).
- **Latency to Bangladesh:** there's no hosting region in Bangladesh. Singapore and Mumbai are the nearest, and the default US region would add noticeable delay to every streamed chat token (basis: Vercel regions docs).
- **Data shape:** listings, users with roles, conversations, viewings, and leads are clearly relational (basis: relational database as the default).
- **AI requirements:** streaming chat, reliable tool calls against real data, bilingual replies, and per message cost.
- **Personal data:** accounts, chats, and contact details are stored, so permission checks must be dependable (privacy and consent is its own spec, feature 17).
- **Payments later:** Bangladesh limits which gateways a local business can use, so that choice waits for the payments feature.

## Options considered

### Option 1: Next.js monolith on Supabase (Postgres, Auth, Storage) + Prisma, AI SDK over OpenRouter, Vercel Singapore (chosen 2026-10-16; its data store part superseded by Option 5 on 2026-10-18)

One app, with one platform supplying the database, auth, and storage. Prisma is the typed data layer, and the AI is reached through a provider independent SDK.

**Pros**:
- Fewest moving parts for database, auth, and storage (one vendor, one region, a local Docker stack).
- Prisma is mature, with a large community and an official agent skill installed here.
- The AI SDK keeps the model swappable, and OpenRouter makes swapping a config change.

**Cons**:
- Prisma connects as a privileged role, so Supabase row level security doesn't protect app queries. Every check lives in server code.
- Two schema owners (Supabase for `auth`/`storage`, Prisma for `public`) need a clear boundary.

### Option 2: Supabase all in (supabase-js + row level security, no ORM)

Query Postgres through the Supabase client with RLS policies as the main permission layer.

**Pros**:
- The database enforces permissions on every query (defence in depth).
- One fewer library, and it follows Supabase's own patterns closely.

**Cons**:
- Permission logic is split across SQL policies and app code. It's harder to test, and RLS surprises are a common source of bugs.
- The query builder is less typed and less ergonomic than an ORM for complex writes, and it ties all data access to Supabase.

### Option 3: Neon Postgres + Drizzle + Better Auth on Vercel

Serverless Postgres, a SQL style ORM, and a self hosted auth library whose users live in your own tables.

**Pros**:
- Users, roles, and sessions sit in your own schema, owned by one migration tool.
- Drizzle is light and serverless friendly. Better Auth has strong roles support and is the main path for new Next.js auth projects.

**Cons**:
- Needs a separate file storage vendor.
- Drizzle 1.0 was still in beta at decision time, and Better Auth 1.7.3 had a breaking upgrade, so there's more version churn to manage.

### Option 4: Hosted everything (Clerk auth + managed Postgres + direct provider SDK)

Buy auth as a service with prebuilt UI, and call one AI provider's SDK directly.

**Pros**:
- Fastest sign in setup, with polished UI out of the box.
- The provider SDK exposes every model feature directly.

**Cons**:
- Per user pricing at scale, and user data sits with a third party.
- Locks the chat to one AI provider, and you write the streaming UI plumbing yourself.

### Option 5: Option 1 with app data on Neon Postgres, Supabase for Auth and Storage only (chosen in the 2026-10-18 amendment)

Everything in Option 1 stays, except that the app tables move from Supabase Postgres to Neon Postgres in Singapore. Prisma, the auth flow, and photo storage don't change.

**Pros**:
- Neon's free tier scales the database to zero instead of pausing the project, and doesn't spend one of Supabase's two free project slots on data.
- Branches give a cheap `staging` and `dev` copy without a local Docker stack, which this machine can't run (podman only).
- The app code doesn't change: Prisma over `@prisma/adapter-pg` works on any Postgres, and the migrations already skip Supabase roles that don't exist.

**Cons**:
- Identity (Supabase) and app data (Neon) sit in two databases: no foreign key, transaction, or backup spans both.
- One more vendor to configure and pay for later.
- Free tier production at launch: a short restore window and cold starts after idle periods.
- Development uses the hosted Supabase staging project, so there's no offline sign in.

## Amendment context (2026-10-18)

During slice 1 the app database was already running on a Neon project in `us-east-2` (Ohio), while the spec said Supabase Postgres in Singapore. The engineer moved for free tier limits (Supabase pauses idle free projects and allows two) and because a Neon account already existed. Spec 0002's migrations were written without a link to `auth.users`, so they ran on Neon unchanged. Two problems surfaced: the Ohio region sat across the Pacific from Vercel `sin1`, and the Neon password was pushed to GitHub in `.env.example`. Specs 0005, 0006, and 0007 (features 6 to 8) reach the database only through Prisma, so the move doesn't touch them; feature 9 has no spec and needs none.

## Rationale

Option 1 fit the forces best at the start (2026-10-16). A small team serving one region needs the fewest vendors for the core (database, auth, storage), and Supabase gave all three in Singapore with a local stack for development. The 2026-10-18 amendment below moved the data store to Neon, and there is no local Supabase stack any more; the rest of this reasoning still holds. Pairing it with Vercel `sin1` puts the app and data side by side, close to Bangladesh, which matters for streaming chat latency.

Some calls were your preferences over my first recommendation, so here are the tradeoffs you're accepting:
- **Prisma over Drizzle.** Both work. Prisma trades a heavier client for maturity and familiarity. Because Prisma bypasses RLS, the stack makes one server only `requireRole` helper mandatory, so permissions live in one testable place rather than nowhere (basis: single enforcement point).
- **Supabase Auth over Better Auth.** Reusing the platform's auth avoids another library and comes with Google, magic link, and password flows. The cost is that identity lives in Supabase's `auth` schema, so the app keeps a `profiles` table keyed by the same id and creates it on first sign in, rather than with a trigger Prisma doesn't know about (basis: one schema owner per schema).
- **`gpt-oss-120b` via OpenRouter instead of a first party frontier model.** It's much cheaper per message, and OpenRouter plus the AI SDK keeps the exit open. Its tool calling and Bangla quality vary by upstream provider, hence the eval Follow-up before the chat spec (basis: verify before you depend).
- **Spend cap only for abuse control.** Accounts are required to chat, which already limits anonymous abuse. Even so, one account can drain the shared cap and take the assistant offline for everyone. Per call token and step limits are set here regardless. The AI chat spec should revisit a cheap per user counter in Postgres (basis: no single user should exhaust a shared resource).

A cross check before acceptance added the hardening in `index.md`: deny by default RLS (Supabase publishes `public` over REST with the public key), Prisma 7 adapter and pooler wiring that works from Vercel builds, a staging project for previews (so previews never touch production and auth redirects work), lazy profile creation, Cache Components with a "public pages never read the session" rule, and UTC/BDT conventions (basis: cheap now, painful after the data model).

**2026-10-18 amendment (Option 5).** Free tier limits drive the move. Neon keeps the database usable on a free plan, and Supabase's two free projects go to auth and storage, which is where its value is (Google, email codes, MFA, signed uploads). Keeping Supabase Auth was chosen over Neon Auth or Better Auth because spec 0004 is fully designed around it; switching would mean rewriting that spec for no gain the forces ask for. The calls made with it:
- **Singapore, not Ohio.** Every chat turn makes several queries from `sin1`, and each one would cross the Pacific. Since only seed data exists, moving now costs a few commands.
- **A separate production project.** Branching `dev` from production would copy names, phones, and chats onto a developer branch, so production lives alone.
- **One shared `staging` branch, migrated only from `main`.** It needs few branches out of the free quota, and unmerged migrations can't break other previews. The cost is that a PR with a schema change has to be tested on `dev`.
- **One migration workflow instead of the Vercel build (from the cross check).** A GitHub Actions job migrates staging, then production, on merge to `main`. That gives one path and no "production only" guard in the build. The cost is a production database secret in GitHub and a rule that every migration stays backward compatible, because Vercel may ship the code before the workflow finishes.
- **`adapter-pg` over TCP.** It's already in place, and the app runs on Node functions, not the edge, so Neon's serverless driver adds nothing.
- **`SUPABASE_DB_URL` for scripts only.** It keeps `mfa:reset`'s session delete exact without putting a second database credential on Vercel.
- **RLS lines kept.** They cost nothing and close the tables if a data API is ever turned on.
- **Free tier production at launch (your call).** I recommended a paid Neon plan before launch for a longer restore window. You chose to launch on the free tier, accepting the short restore window and cold starts. A scheduled `pg_dump` is in Follow-up as a cheap backstop.

`after()` plus Vercel Cron and an outbox table covers email retries without a job vendor (basis: a database backed queue first). Payments stay undecided because the gateway depends on your legal entity: Stripe is generally not available to Bangladesh registered businesses, while SSLCommerz covers local cards, bKash, and Nagad.

## References

**Project sources**:
- `package.json` (Next.js 16.4.2, React 19.3, Tailwind v4, npm)
- `docs/scope/scope.md` (product intent, slices, success metric, Tracer Bullet approach)
- `desing-check/aurevia-estates/` (mockups: assistant with an English/Bangla toggle, admin dashboard)
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` (middleware renamed to proxy)
- Installed skills: `supabase`, `supabase-postgres-best-practices`, `prisma-orm-setup`, `prisma-client-api`, `ai-sdk`, `vercel-react-best-practices`, `resend`, `react-email`, `sentry-nextjs-sdk`

**Practices & standards**:
- Monolith first for small teams
- A relational database as the default for relational data
- A database backed queue before a dedicated job runner
- One schema owner per schema; one enforcement point for authorization
- Pin compute to the same region as the database

**Links** (web verified during the landscape check):
- Vercel regions: https://vercel.com/docs/regions
- Vercel function region config: https://vercel.com/docs/functions/configuring-functions/region
- AI SDK introduction: https://ai-sdk.dev/docs/introduction
- Better Auth blog (version notes, Auth.js stewardship): https://www.better-auth.com/blog
- Drizzle ORM overview: https://orm.drizzle.team/docs/overview
- MapLibre GL JS docs: https://maplibre.org/maplibre-gl-js/docs/
