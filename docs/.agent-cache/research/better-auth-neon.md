# Better Auth + Neon research (fetched 2026-10-22)

Budget used: 5 searches, 8 page fetches. Docs pages carried no explicit version stamp unless noted.

## Better Auth

1. Version: GitHub release v1.7.0 exists (https://github.com/better-auth/better-auth/releases/tag/v1.7.0). Patch releases after 1.7.0 NOT confirmed. Breaking changes in 1.7 (per release notes and 1.7 RC blog, https://better-auth.com/blog/1-7-rc): Microsoft accounts keyed by `oid`; Account.accountId renamed to providerAccountId and Account.issuer required; oidcProvider plugin removed (use @better-auth/oauth-provider); MCP moved to @better-auth/mcp; genericOAuth signIn.oauth2 replaced by signIn.social({ provider }); joins moved to advanced.database.joins; sync OAuth2 helpers removed; forwarded proxy headers not trusted by default (advanced.trustedProxyHeaders); auth CLI needs Node 22.12+; `max_age` now enforced. Upgrade guide: https://better-auth.com/docs/guides/1-7-upgrade-guide

2. Prisma adapter (https://www.better-auth.com/docs/adapters/prisma): uses `@better-auth/prisma-adapter` (extracted in 1.5), `prismaAdapter(prisma, { provider: "postgresql" })`, Prisma 7 with @prisma/adapter-pg shown. `npx auth@latest generate` writes the schema; you run `prisma migrate dev` yourself. Set advanced.database.joins: true (adapter 1.4+). Model/field mapping (user to profiles, name to full_name, image to avatar_url) and additionalFields syntax NOT in the fetched page; not confirmed.
   - UUID ids: `advanced.database.generateId: "uuid"` (https://better-auth.com/docs/concepts/database). On Postgres the default lets the DB generate ids. A generateId callback can return false to let Postgres generate that model's id. Prisma-specific uuid behavior not confirmed.
   - Whether `name` must be non-null: NOT confirmed.

3. emailOTP (https://www.better-auth.com/docs/plugins/email-otp):
   - Options: otpLength (default 6), expiresIn (seconds, default 300), allowedAttempts (default 3), disableSignUp (default false), overrideDefaultEmailVerification (replaces verification link with OTP; default not stated), sendVerificationOnSignUp (default false).
   - OTP types: sign-in, email-verification, forget-password (a change-email type is mentioned in one section only).
   - Callback: `sendVerificationOTP({ email, otp, type })`. Do not await the email send (timing); use waitUntil on serverless.
   - Sign-in with OTP: POST /sign-in/email-otp (auth.api.signInEmailOTP). It CREATES the user on first use unless disableSignUp is true; optional name and image apply.
   - Reset: POST /email-otp/reset-password with email, otp, password. Call /email-otp/request-password-reset first; optional /email-otp/check-verification-otp.

4. twoFactor (https://www.better-auth.com/docs/plugins/2fa):
   - TOTP plus backup codes (single-use, stored in DB; regenerating deletes old ones; viewBackupCodes is server-only).
   - Only ONE verified TOTP authenticator per user: enabling again returns TOTP_ALREADY_ENABLED, so disable the current one first.
   - Options: issuer, skipVerificationOnEnable (default false), trustDevice (30 days, per verify call).
   - How a session is flagged as 2FA-verified: NOT confirmed in the page. Check the twoFactor plugin's session/user fields (twoFactorEnabled on user is confirmed).
   - Server-side disable: auth.api.disableTwoFactor({ body: { password }, headers: await headers() }). Password required for credential accounts.

5. captcha (https://www.better-auth.com/docs/plugins/captcha): hCaptcha SUPPORTED (others: reCAPTCHA, Turnstile, CaptchaFox, Vercel BotID). Options: provider, secretKey, endpoints (replaces defaults, which are /sign-up/email, /sign-in/email, /request-password-reset; supports * and **), siteKey (hCaptcha), minScore. Token header: `x-captcha-response`.

6. Rate limiting (https://www.better-auth.com/docs/concepts/rate-limit): storage "memory" is the default and the docs say it may not suit serverless. Use storage: "database" (modelName default "rateLimit"; run the migration or ORM generate) or "secondary-storage". customRules keyed by path: { window, max }, an async function, or false. Wildcards supported.

7. Sessions and Next.js (https://better-auth.com/docs/integrations/next): nextCookies() plugin should be LAST in plugins; it sets cookies returned by server actions. getSessionCookie from "better-auth/cookies" is a cookie-presence check only, not validation; use it for optimistic redirects in proxy. Full checks should use auth.api.getSession in the Node runtime. Do not treat proxy as authorization.
   - cookieCache, freshAge, expiresIn, updateAge, revokeSessions, revokeOtherSessions, getSession({ headers }) signatures: NOT re-verified in this run (budget).

8. Account linking: account.accountLinking.trustedProviders (e.g. ["google"]) auto-links even when the provider does not confirm email (takeover risk). disableImplicitLinking blocks same-email auto link; linkSocial() still works for signed-in users. Unlink: listAccounts to get the id, then unlinkAccount({ accountId }); unlinking the only account is blocked unless allowUnlinkingAll. Google provider page (https://better-auth.com/docs/authentication/google) was listed but not fetched.

9. toNextJsHandler mount: NOT fetched. CLI: `npx auth@latest generate` (and `auth migrate`), confirmed from the Prisma page and 1.7 notes.

## Neon

10. Singapore: aws-ap-southeast-1 (AWS Asia Pacific, Singapore) is listed as a supported region (https://neon.com/docs/introduction/regions). Region CANNOT be changed for an existing project (https://neon.com/faqs/change-project-region). You must create a new project in that region and migrate data (pg_dump/pg_restore). On the Free plan (one project), export, delete, then recreate. Branches share the project region.

11. Pooled vs direct (https://neon.com/docs/connect/connection-pooling): pooled host adds `-pooler` to the endpoint id. Use direct (no suffix) for migrations. Prisma (https://www.prisma.io/docs/orm/overview/databases/neon): DATABASE_URL pooled for runtime, DIRECT_URL direct for prisma.config.ts CLI commands. connect_timeout default 5s for cold start.

12. Adapter: the Prisma Neon page covers only @prisma/adapter-neon (serverless driver over HTTP/WebSockets, for serverless/edge). It does not compare with @prisma/adapter-pg and does not state a Vercel recommendation. Current recommendation NOT confirmed.

13. Branches: included on Free, up to 10 per project (https://neon.com/docs/introduction/plans). Dev/staging/preview via child branches.

14. Free plan: 1 GB Postgres storage per project, 20 GB total across projects; Object Storage separate 5 GB per project; 100 CU-hours per project per month; up to 100 projects. Relevant: bytea photos count toward the 1 GB per project. (https://neon.com/docs/introduction/plans)

## Sources (confirmed fetch or search)
- https://www.better-auth.com/docs/adapters/prisma
- https://www.better-auth.com/docs/plugins/email-otp
- https://www.better-auth.com/docs/plugins/2fa
- https://www.better-auth.com/docs/plugins/captcha
- https://www.better-auth.com/docs/concepts/rate-limit
- https://better-auth.com/docs/integrations/next
- https://better-auth.com/docs/concepts/database
- https://better-auth.com/docs/guides/1-7-upgrade-guide
- https://github.com/better-auth/better-auth/releases/tag/v1.7.0
- https://neon.com/docs/connect/connection-pooling
- https://neon.com/docs/introduction/plans
- https://neon.com/docs/introduction/regions
- https://neon.com/faqs/change-project-region
- https://www.prisma.io/docs/orm/overview/databases/neon

## Not confirmed
Latest patch after 1.7.0; name nullability; additionalFields and model/field mapping syntax; Prisma uuid specifics; 2FA session flag; cookieCache/freshAge/revokeOtherSessions; toNextJsHandler; adapter-pg vs adapter-neon recommendation; Google linking page content.
