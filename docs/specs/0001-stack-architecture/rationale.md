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

### Option 1: Next.js monolith on Supabase (Postgres, Auth, Storage) + Prisma, AI SDK over OpenRouter, Vercel Singapore (original choice, replaced 2026-10-22)

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

## Rationale

Option 1 fits the forces best. A small team serving one region needs the fewest vendors for the core (database, auth, storage), and Supabase gives all three in Singapore with a local stack for development. Pairing it with Vercel `sin1` puts the app and data side by side, close to Bangladesh, which matters for streaming chat latency.

Some calls were your preferences over my first recommendation, so here are the tradeoffs you're accepting:
- **Prisma over Drizzle.** Both work. Prisma trades a heavier client for maturity and familiarity. Because Prisma bypasses RLS, the stack makes one server only `requireRole` helper mandatory, so permissions live in one testable place rather than nowhere (basis: single enforcement point).
- **Supabase Auth over Better Auth.** Reusing the platform's auth avoids another library and comes with Google, magic link, and password flows. The cost is that identity lives in Supabase's `auth` schema, so the app keeps a `profiles` table keyed by the same id and creates it on first sign in, rather than with a trigger Prisma doesn't know about (basis: one schema owner per schema).
- **`gpt-oss-120b` via OpenRouter instead of a first party frontier model.** It's much cheaper per message, and OpenRouter plus the AI SDK keeps the exit open. Its tool calling and Bangla quality vary by upstream provider, hence the eval Follow-up before the chat spec (basis: verify before you depend).
- **Spend cap only for abuse control.** Accounts are required to chat, which already limits anonymous abuse. Even so, one account can drain the shared cap and take the assistant offline for everyone. Per call token and step limits are set here regardless. The AI chat spec should revisit a cheap per user counter in Postgres (basis: no single user should exhaust a shared resource).

A cross check before acceptance added the hardening in `index.md`: deny by default RLS (Supabase publishes `public` over REST with the public key), Prisma 7 adapter and pooler wiring that works from Vercel builds, a staging project for previews (so previews never touch production and auth redirects work), lazy profile creation, Cache Components with a "public pages never read the session" rule, and UTC/BDT conventions (basis: cheap now, painful after the data model).

`after()` plus Vercel Cron and an outbox table covers email retries without a job vendor (basis: a database backed queue first). Payments stay undecided because the gateway depends on your legal entity: Stripe is generally not available to Bangladesh registered businesses, while SSLCommerz covers local cards, bKash, and Nagad.

## Revision 2026-10-22: Neon and Better Auth replace Supabase

**What changed.** The database moved to Neon while auth stayed in Supabase, so identity and profile ended up in two vendors and two regions (Supabase, and Neon in us-east-2), with no foreign key or transaction between them. A verify run the same day also found migration drift in the Neon database and a Cache Components error inside Supabase's token check on signed in pages. The engineer chose to leave Supabase entirely.

**The new choice** is a variant of Option 3: Neon Postgres and Better Auth, but keeping Prisma instead of Drizzle. Prisma stays because the whole data layer (specs 0002, 0005, 0006) is already built on it, and Better Auth's Prisma adapter supports Prisma 7 with `@prisma/adapter-pg` (basis: reuse what the project runs). Option 3's cons still hold: file storage now has no vendor, which the engineer settled by storing resized photos in Neon, and Better Auth's version churn is real (a breaking 1.7 release), so the version is pinned.

**Why it now beats Option 1.** Option 1's main pro was one platform for data, auth, and storage. Once the database left Supabase, that pro was gone and only its costs remained: two vendors per environment, a webhook on the email path, and a service role key at request time. Moving the database back to Supabase was the other way to remove the split; the engineer preferred owning identity in the app's own database (basis: one schema owner per schema).

**Region.** A Neon project's region can't be changed, so a new project is created in `aws-ap-southeast-1` to keep the database beside the `sin1` functions (basis: pin compute to the same region as the database). The old us-east-2 project holds only sample data and is retired after the move. *(Replaced by the 2026-10-25 revision below: the us-east-2 project is kept.)*

**Photos.** Storing images in Postgres is normally avoided. It's acceptable here because uploads are resized to about 300 KB, kept in their own table that list queries never read, and served through the CDN with immutable cache headers; the 1 GB free plan limit is the tripwire for revisiting object storage.

The sign in design that follows from this is spec 0008, which supersedes spec 0004.

## Revision 2026-10-25: keep Neon in Ohio, functions in `cle1`

**What changed.** The engineer chose to keep the existing Neon project in us-east-2 instead of creating a new one in Singapore. It already holds every migration, Better Auth's included, and the sign in thread passes its smoke checks there, so the move would cost a rebuild for no new behavior.

**Function region.** The Region convention (compute beside the database) decides it. Every signed in request reads the session and profile from Neon, and many pages make several queries, so keeping `sin1` would add about 200 ms per query. `cle1` (Cleveland) shares the us-east-2 metro, giving a millisecond or two per query (basis: pin compute to the same region as the database). The runner up was `iad1` (Washington DC, Vercel's default), about 10 ms away with no upside. The engineer picked `cle1`.

**Cost of the choice.** The 2026-10-16 force "latency to Bangladesh" now loses to "keep what is built": visitors pay one transpacific round trip per request (roughly 250 ms), and the first streamed chat token arrives that much later. If that hurts, the fix is a new Neon project near Bangladesh plus a data copy and a matching function region, its own spec.

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
