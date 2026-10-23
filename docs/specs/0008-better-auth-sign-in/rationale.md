# 0008. Rationale: sign in on Better Auth and Neon

## Context

Spec 0004 built sign in on Supabase Auth, with the app database in the same Supabase project. In practice the app's database moved to a Neon project in us-east-2 while auth stayed in Supabase, so the two halves of every user now live in different vendors and regions: the session and identity in Supabase, the profile and everything it owns in Neon, with no foreign key or transaction between them. A verify run on 2026-10-22 also found that the Neon database's migration history had drifted from the repo (a renamed migration, an unknown column, an unapplied one), and that signed in pages hit a Cache Components error inside Supabase's token check.

The engineer decided to leave Supabase entirely: one database (Neon), one auth system living in that database, and no Supabase Storage. The forces at play: the product targets Bangladesh and pins functions to Singapore, so the database must sit there too; agents open every lead's contact details, so their accounts need a strong second factor; sign up must resist bots because each account can spend AI budget; there are no real users yet, so nothing has to be migrated.

Not deciding leaves a split brain identity (Supabase user plus Neon profile), two vendors to configure per environment, a webhook on the email critical path, and a database on the far side of the Pacific from its functions.

## Options considered

### Option 1: Stay on Supabase Auth, move only the database

Keep spec 0004 as built and point Prisma at Neon in Singapore.

**Pros**:
- No auth code changes; spec 0004's design and its built code stand.
- Supabase keeps an auth audit log, leaked password protection on Pro, and several named authenticators per user.

**Cons**:
- Identity and profile live in different vendors with no foreign key or shared transaction, which is the split the engineer wants to end.
- Two vendors per environment, the Send Email Hook on the critical path, and the service role key at request time all stay.
- The Supabase token check's `Date.now()` error on signed in pages still needs a fix.

### Option 2: Better Auth inside the app, tables in Neon (chosen)

A self hosted auth library mounted in Next.js, its tables in our Neon database through its Prisma adapter, with plugins for email codes, TOTP 2FA, captcha, and Next.js cookies.

**Pros**:
- Users, sessions, codes, and 2FA secrets sit in our own tables beside the profile, one schema owner (Prisma), one database, one region.
- Emails are sent in process, so no webhook or signature secret is needed.
- Its HTTP endpoints can be switched off, so our actions (with captcha and rate limits) become the only way in.

**Cons**:
- We operate auth security ourselves, and the library moves fast (a breaking 1.7 release).
- One authenticator per user, and 2FA runs at password sign in, so agents lose Google and email code sign in.
- No built in audit log; rate limit counts and sessions add database writes.

### Option 3: Auth.js on Neon

Auth.js (formerly NextAuth) with its Prisma adapter.

**Pros**:
- Long history in Next.js projects; Google and email providers are mature.

**Cons**:
- No built in TOTP 2FA or email code plugin: the agent MFA, captcha, and code flows would be our own code.
- Its database sessions plus credentials provider combination is awkward, which is the password path this product needs.

### Option 4: A hosted auth provider on Neon

A hosted service such as Clerk for identity, with Neon for app data.

**Pros**:
- MFA, bot protection, and audit logs come built in and are run by the vendor.

**Cons**:
- Identity again lives outside our database, the same split as Option 1.
- A new paid vendor with per user pricing, and branded email and sign in pages take more work to match `design.md`.

## Rationale

The engineer's goal is one database that owns everything, in Singapore, with no Supabase. That rules out Options 1 and 4, which both keep identity in another vendor. Between the self hosted libraries, Better Auth (Option 2) ships the exact pieces this product needs as maintained plugins (6 digit email codes, TOTP with backup codes, hCaptcha, database backed rate limits), while Auth.js (Option 3) would leave the most security sensitive parts as custom code (basis: prefer maintained building blocks over custom security code).

Mapping Better Auth's user model onto the existing `profiles` table keeps every foreign key from specs 0002, 0005, and 0006 intact and keeps the role readable without a join (basis: one schema owner per schema). Reading the session from the database on every request, with no cookie cache, keeps spec 0004's promise that revocation is immediate (basis: deny by default in one server helper).

The biggest change is agent MFA. Better Auth's twoFactor plugin runs the code step as part of password sign in and holds one authenticator per user. Rather than build a parallel step up check around it, agents always sign in with password plus code and their session lasts 12 hours, which turns spec 0004's "fresh code within 12 hours" rule into a session lifetime (basis: step up authentication for privileged roles). The cost, accepted by the engineer, is that agents can't use Google or email codes, and a lost phone without backup codes needs an operator reset. A big bang migration onto a fresh database is right here only because no real users or data exist; with live users this would need a strangler migration (basis: strangler versus big bang migration).

## References

**Project sources**: spec 0001, spec 0002, spec 0004 and its rationale, the verify run of 2026-10-22 (migration drift, the Cache Components error), `.claude/skills/better-auth-best-practices/`, `.claude/skills/two-factor-authentication-best-practices/`, `.claude/skills/neon-postgres/`.

**Practices and standards**: prefer maintained building blocks over custom security code; one schema owner per schema; deny by default in one server helper; step up authentication for privileged roles; strangler versus big bang migration.

**Links** (verified during this design):
- Better Auth 1.7 upgrade guide: https://better-auth.com/docs/guides/1-7-upgrade-guide
- Better Auth two factor plugin: https://www.better-auth.com/docs/plugins/2fa
- Better Auth email OTP plugin: https://www.better-auth.com/docs/plugins/email-otp
- Neon regions and region changes: https://neon.com/docs/introduction/regions , https://neon.com/faqs/change-project-region
