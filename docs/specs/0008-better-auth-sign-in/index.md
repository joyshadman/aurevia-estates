# 0008. Visitor and agent sign in on Better Auth and Neon

**Date**: 2026-10-22
**Status**: In Progress
**Supersedes**: [0004](../0004-visitor-agent-sign-in/index.md)

## Summary

Sign in moves off Supabase onto Better Auth (an auth library that runs inside our own Next.js app and keeps users, sessions, and codes in our own database). The database becomes a new Neon Postgres project in Singapore, and the `profiles` table becomes Better Auth's user table, so every existing link to a profile keeps working. Visitors keep the same choices as before (Google, a 6 digit email code with a link, or a password), while agents now always sign in with a password plus an authenticator code, and their session lasts 12 hours. Auth emails are still our own React Email templates sent through Resend, now sent straight from Better Auth instead of through a Supabase webhook.

## Requirements

**User stories** (unchanged from spec 0004):
- As a visitor, I want to sign in with Google, an email code, or a password, so I can chat and book without friction.
- As a visitor reading email on my phone, I want a code I can type, so sign in works whatever app opens the email.
- As a visitor who clicked "Ask the assistant", I want to land back where I was after signing in.
- As an agent, I want my account protected by a second factor, because it opens every lead's contact details.
- As an agent who lost my phone, I want a backup and a way back in.
- As a signed in user, I want to edit my name and phone, manage my password, MFA, and linked sign in methods, and sign out of all devices.
- As the owner, I want sign up protected from bots, so throwaway accounts can't drain the AI budget.

**Acceptance criteria** (spec 0004's contract, rewritten where Better Auth works differently; changed criteria say what changed):
- **AC-1**: `/sign-in` offers Continue with Google, Email code, and Password (sign in or create account), plus Forgot password. It accepts a `next` query value; after any successful sign in the user lands on `next` when it passes `safeNext`, else on the default landing (AC-12). A user who is already signed in and opens `/sign-in` is redirected the same way at once.
- **AC-2**: Email code: submitting an email sends one email with a 6 digit code and a link to `/auth/confirm` that carries the email and the code. Entering the code on the page, or opening the link in any browser and pressing Continue, signs the user in (creating the account on first use). Opening the link without pressing Continue (as mail scanners do) does not use it up. The code expires after 10 minutes, works once, and stops working after 3 wrong attempts; a wrong, used, or expired code shows the `otp_invalid` message. The same email can request a new code at most once per 60 seconds; the button shows the countdown. *(Changed: the link carries the code itself, and 3 wrong attempts end the code.)*
- **AC-3**: Password sign up: an 8+ character password with at least one letter and one digit creates the account but no session; the user is shown the code entry step, and only after confirming (code or link) are they signed in. Signing in with a password before confirming shows the `email_not_confirmed` message with a Send code action.
- **AC-4**: Every sign up, password sign in, email code request, code entry, `/auth/confirm` Continue, password reset request, and new password submit carries an hCaptcha token, checked once by our server action before it calls Better Auth. A request without a valid token is rejected with the `captcha_failed` message, no email is sent, and the widget resets. Google sign in and the signed in "set a first password" request do not use the captcha. Better Auth's own HTTP endpoints are switched off except Google's callback, so no auth path skips our actions. Public auth actions are also rate limited per IP and per email. *(Changed: our actions are the only way in, and Continue now carries a token too.)*
- **AC-5**: Google: Continue with Google signs in or creates the account and returns to `next`. If the user cancels at Google or Google returns an error, they are back on `/sign-in` with the `google_cancelled` message and nothing else changes. A Google sign in with the same email as an existing account signs into that same account (same profile, same chats); if that account's email was never verified, its password is replaced with a random one before the link. *(Changed: the unverified password guard now also covers Google.)*
- **AC-6**: The profile row is the user row, created by Better Auth at first sign in with role VISITOR, `full_name` and `avatar_url` from Google when present. A user whose profile has `deleted_at` set gets no session at all and sees the `account_deleted` message. *(Changed: no separate profile creation step.)*
- **AC-7**: Forgot password: requesting a reset always shows "If that email has an account, we've sent a code", and takes the same time whether or not the account exists. The code (typed on `/sign-in`) or the link (on `/auth/confirm` itself) opens the "Set a new password" step; the new password follows the rule. Saving it marks the email verified and ends every other session. After saving, a user without 2FA is signed in; a user with 2FA is taken to the authenticator code step before a session exists. *(Changed: 2FA comes after the new password, as part of signing in.)*
- **AC-8**: Agent pages (everything under `/dashboard`) and agent actions: a signed out user is redirected to `/sign-in?next=<path>`; a signed in non agent gets a 404 page; an agent with 2FA not enabled is sent to `/account/security?setup=required&next=<path>`; an agent whose session did not pass the authenticator step, or passed it more than 12 hours ago, is sent to `/sign-in?next=<path>&error=agent_reauth` (password, then code), and `/sign-in` shows that step instead of redirecting them back. The check reads the session from Neon on each request, so after `mfa:reset` or Sign out everywhere the old session gets nothing. Every agent server action applies the same check and returns `{ ok: false, reason }` instead of acting; a stale agent session is ended by the action (never during a page render). *(Changed: a stale or weak agent session signs in again instead of a separate `/mfa` code page.)*
- **AC-9**: MFA: from `/account/security` a user with a password can turn on 2FA: enter the password, scan a QR code (or type the manual key), and confirm with a code. They are then shown 10 single use backup codes once, with Copy and Download. A user without a password is first asked to set one (AC-10). An agent can turn on 2FA only within 15 minutes of signing in; otherwise they are asked to sign in again first. The page shows how many backup codes remain and offers Regenerate (old codes stop working). At the sign in code step, 5 wrong authenticator or backup codes end the pending step (sign in again) and are reported to Sentry. A promoted agent with no password signs in by email code, is sent to setup, sets a password by emailed code, and turns 2FA on in the same 15 minute window. Turning 2FA off, regenerating codes, and unlinking a method need the password and a session that passed the code step in the last 12 hours; an agent cannot turn 2FA off. After setup the user lands on `next` when it passes `safeNext`. *(Changed: one authenticator plus backup codes instead of several named authenticators.)*
- **AC-10**: Account page (`/account`): a signed in user can edit `full_name` (1 to 80 characters) and `phone` (any country, Bangladesh preselected, validated and saved in E.164); change their password by entering the current one, or set a first password with a fresh emailed code (either one ends every other session); see their linked sign in methods, link Google, and unlink a method while at least one other remains; sign out of this device; sign out everywhere (all sessions, then back to `/sign-in`). *(Changed: changing a password asks for the current one.)*
- **AC-11**: `safeNext` accepts only same site paths: the value parsed with `new URL(value, NEXT_PUBLIC_SITE_URL)` has the site's origin; the raw value starts with a single `/`, has no backslash, no character below `0x20`, no `%5c` or `%2f` (any case), is under 512 characters, and is not under `/auth/` or `/api/`. Anything else is ignored silently. All redirects are built from `NEXT_PUBLIC_SITE_URL`, never the request `Host`.
- **AC-12**: Default landing: role AGENT goes to `/dashboard/leads` (through the agent check); everyone else goes to `/assistant`.
- **AC-13**: Auth emails (sign in code, sign up confirmation, password reset, set a first password) are rendered from React Email templates in the brand style and sent through Resend from Better Auth's email callback. The sign in code and set a first password emails are awaited: a Resend failure fails the request, the user sees `email_send_failed`, and Sentry gets the event. The sign up confirmation and password reset emails are sent after the response (so an existing account takes no longer than an unknown one); their failures go to Sentry only. Each email contains the code and a link to `/auth/confirm`. Before sending a sign in code to an account whose email was never verified, the account's password (if any) is replaced with a random one; a second password sign up for an unverified email replaces the first one's password. *(Changed: no webhook, and two emails are sent in the background.)*
- **AC-14**: Scripts: `npm run agent:promote -- <email> --env <staging|production>` sets role AGENT, `agent:demote` sets VISITOR, and `mfa:reset` turns 2FA off, deletes its secret and backup codes, and ends every session for that user. On production each asks the operator to type the email again. Each takes effect on the user's next request, refuses unknown emails, prints the reminder "Ask the agent to sign in and turn on 2FA now", and reports to Sentry with the operator's machine user name.
- **AC-15**: Sessions: a signed in visitor stays signed in across browser restarts for 30 days, extended at most once a day when they take an action (a page view alone doesn't extend it). An agent's session ends 12 hours after it was created and is never extended. Sign out ends the current device's session only; Sign out everywhere ends all of them.
- **AC-16** *(new)*: Nothing in the running app talks to Supabase: no Supabase package, env variable, client, or URL remains, and every table, including the auth tables, lives in the Neon project in Singapore.

## Decision

**Chosen option**: Option 2: Better Auth inside the Next.js app, its tables in Neon managed by Prisma, with the `emailOTP`, `twoFactor`, and `nextCookies` plugins, our own `/auth/confirm` link, and our own captcha and rate limit checks.

Better Auth is mounted at `/api/auth/[...all]` with every endpoint switched off except Google's callback, and called from our server actions through `auth.api.*`; the browser never reaches it except through Google's redirect. Authorization still lives only in `lib/server/auth.ts` (spec 0001), which now reads the session with `auth.api.getSession()` and the role from the profile row on every request.

**Implementation skills**: `better-auth-best-practices` (`better-auth/skills`, `.claude/skills/better-auth-best-practices/`) · `better-auth-security-best-practices` (`better-auth/skills`, `.claude/skills/better-auth-security-best-practices/`) · `email-and-password-best-practices` (`better-auth/skills`, `.claude/skills/email-and-password-best-practices/`) · `two-factor-authentication-best-practices` (`better-auth/skills`, `.claude/skills/two-factor-authentication-best-practices/`) · `neon-postgres` (`neondatabase/agent-skills`, `.claude/skills/neon-postgres/`) · `neon-postgres-branches` (`neondatabase/agent-skills`, `.claude/skills/neon-postgres-branches/`) · `prisma-client-api` (`prisma/skills`, `.claude/skills/prisma-client-api/`) · `supabase-postgres-best-practices` (`supabase/agent-skills`, `.claude/skills/supabase-postgres-best-practices/`, plain Postgres rules) · `resend` (`resend/resend-skills`, `.claude/skills/resend/`) · `react-email` (`resend/react-email`, `.claude/skills/react-email/`) · `sentry-nextjs-sdk` (`getsentry/sentry-for-ai`, `.claude/skills/sentry-nextjs-sdk/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

### Data model

The target, replayed from the repo's migrations into the fresh Neon project. Prisma owns every table (there is no `auth` schema any more). Better Auth reads and writes through its Prisma adapter, using Prisma model names (`modelName: "profile"`, not `"profiles"`). Ids are uuid v7 from the app: `advanced.database.generateId` returns `uuidv7()` from `lib/server/uuid.ts`. Column names below are the database names; field names follow what `npx auth@latest generate` produces for Better Auth 1.7, mapped to snake case with `@map`.

| Table (Prisma model) | Columns (new or changed in bold) | Keys and rules |
|---|---|---|
| `profiles` (`Profile`, Better Auth's user) | `id` uuid, **`email` text not null**, **`email_verified` boolean not null default false**, **`full_name` text not null default ''** (Better Auth `name`), `avatar_url` (Better Auth `image`), **`two_factor_enabled` boolean not null default false**, `role`, `phone`, agent fields, `deleted_at`, `created_at`, `updated_at` | PK `id`; **unique `email`** (stored lowercased). `role`, `phone`, `deleted_at` are Better Auth `additionalFields` with `input: false`, so no auth request can set them. Every existing foreign key to `profiles.id` is unchanged. |
| `sessions` (`Session`) | `id` uuid, `user_id`, `token`, `expires_at`, `ip_address`, `user_agent`, **`two_factor_verified_at` timestamptz null**, `created_at`, `updated_at` | PK `id`; unique `token`; index `user_id`; FK `user_id` → `profiles.id` on delete cascade. `two_factor_verified_at` is a session `additionalField` with `input: false`. |
| `accounts` (`Account`) | `id` uuid, `user_id`, `provider_id` (`credential` or `google`), the provider account id field (1.7 name), `password` (hash, credential only), `access_token`, `refresh_token`, `id_token`, `access_token_expires_at`, `refresh_token_expires_at`, `scope`, `created_at`, `updated_at` | PK `id`; unique (`provider_id`, provider account id); index `user_id`; FK `user_id` → `profiles.id` on delete cascade |
| `verifications` (`Verification`) | `id` uuid, `identifier`, `value`, `expires_at`, `created_at`, `updated_at` | PK `id`; index `identifier`. Holds email codes (one row per email and purpose). |
| `two_factors` (`TwoFactor`) | `id` uuid, `user_id`, `secret` (encrypted), `backup_codes` (encrypted) | PK `id`; **unique `user_id`** (one authenticator per user); FK `user_id` → `profiles.id` on delete cascade |
| `rate_limits` (`RateLimit`) | `id` uuid, `key`, `count` int, `last_request` bigint | PK `id`; unique `key` |

- `full_name` becomes not null with `''` meaning "not set", because Better Auth requires a name string. A shared `displayName(profile)` in `lib/domain/` falls back to the email when the name is blank. The Prisma type change (`String?` to `String`) makes every reader fail to compile until it uses `displayName`; also search for `fullName ??` and `full_name` in raw SQL, e2e fixtures, and the seed.
- The auth migration follows the safe sequence even though the tables are empty on the fresh database: add `email_verified` and `two_factor_enabled` with defaults, set `full_name` to `''` where null then add its default and NOT NULL, lowercase and backfill `email` then add NOT NULL and the unique index. The seed runs after it, writing lowercased emails with `email_verified = true` and no `accounts` rows. Feature 17's account deletion must rewrite `email` to a unique placeholder, since the column is now not null and unique.
- The raw SQL foreign key from `profiles.id` to `auth.users(id)` is gone. The guarded `DO $$` row level security blocks in existing migrations stay (they do nothing on Neon); new tables do not add them (spec 0001).
- `leads.anonymized_at`, which exists only in the old database, is not carried over.

### State transitions

Session strength (stored on the session row, checked on each request):

`signed out` → (Google, email code, or password without 2FA) → `session` → (agent pages) → ended, sign in again with password.
`signed out` → (password, 2FA on) → `waiting for code` (Better Auth's temporary 2FA cookie, 10 minutes, no session yet) → (TOTP or backup code) → `session with two_factor_verified_at = now`.
A session with `two_factor_verified_at` within 12 hours is `fresh`; older, or null, is `not fresh`. Agent sessions also expire 12 hours after creation and are never extended. The role is read when a session is created, so a session created before a promotion keeps its 30 day life, but it is never `fresh`, so the agent gate still stops it. Turning on 2FA (verifying the first code) sets `two_factor_verified_at` on the session the user ends up with (task 5 confirms whether Better Auth replaces the session at that point; see *Database hooks*).
Users with 2FA on who sign in with Google or an email code get no code step (the plugin only challenges password sign in). That is accepted for visitors; agents are covered by the gate.

### Routes and pages

All auth pages read cookies or `searchParams`, so each renders its dynamic part inside `<Suspense>` (Cache Components, spec 0001) and is never cached.

| Path | Kind | What it does |
|---|---|---|
| `/sign-in` | page | steps: choose method → enter code, password, or authenticator code → done; reads `next`, `error`, and `step`; signed in users are redirected (AC-1), except when `error=agent_reauth` or the user is an agent whose session is not fresh (the same predicate as `requireAgent`). The authenticator step is chosen on the server from Better Auth's 2FA cookie, so a reload keeps `?step=2fa&next=` |
| `/api/auth/[...all]` | route handler | Better Auth, mounted with `toNextJsHandler(auth)`. Every endpoint is switched off (`disabledPaths`) except Google's callback (`/callback/:id`), `/error`, and `/ok` |
| `/auth/continue` | page | Google's `callbackURL`: confirms the session, runs `completeSignIn`, redirects to `next` or the default landing |
| `/auth/confirm` | page | email links land here (`?email=&code=&type=sign-in|verify|reset&next=`); shows "Continue signing in" (or, for `type=reset`, the new password field) with the invisible captcha; GET never uses the code. Sent with `Referrer-Policy: no-referrer` and `Cache-Control: no-store`; the page removes the query from the address bar with `history.replaceState` once read |
| `/sign-in/new-password` | removed | the new password is set on `/auth/confirm` (link) or the `/sign-in` reset step (typed code), so the code never moves to another URL |
| `/account` | page, signed in | name and phone, password, linked methods, sign out actions |
| `/account/security` | page, signed in | 2FA: turn on (password, QR, confirm code), backup codes (count, regenerate), turn off; `setup=required` banner for agents |

`/mfa` and `/api/hooks/send-email` are removed. `proxy.ts` (spec 0001) matcher: every path except `/_next/static`, `/_next/image`, `/api/auth/`, `favicon.ico`, and files with an extension. It refreshes nothing; its one cheap redirect is: no Better Auth session cookie (`getSessionCookie(request)`) on `/account`, `/dashboard`, or `/assistant` → `/sign-in?next=<path>`. It is never the security check.

### Better Auth configuration

One instance in `lib/server/auth-config.ts` (`import "server-only"`), read by `lib/server/auth.ts`, the route handler, and the scripts.

- **Core**: `baseURL` = `NEXT_PUBLIC_SITE_URL`; `secret` = `BETTER_AUTH_SECRET`; `trustedOrigins` = the site URL only (one fixed origin per environment); `database: prismaAdapter(db, { provider: "postgresql" })`; `advanced.database.generateId: () => uuidv7()`; `advanced.ipAddress.ipAddressHeaders: ["x-vercel-forwarded-for", "x-real-ip"]` (never `x-forwarded-for`); `disabledPaths`: every endpoint except `/callback/:id`, `/error`, `/ok`, so the only way into auth is our server actions calling `auth.api.*` (which ignores `disabledPaths`; task 1 confirms this).
- **User**: `modelName: "profile"`, `fields: { name: "fullName", image: "avatarUrl" }`, `additionalFields`: `role` (default `VISITOR`), `phone`, `deletedAt`, all `input: false`.
- **Session**: `modelName: "session"`, `expiresIn` 30 days, `updateAge` 1 day, `freshAge` 15 minutes, no `cookieCache`, `additionalFields.twoFactorVerifiedAt` (`input: false`).
- **Email and password**: enabled, `requireEmailVerification: true`, `minPasswordLength: 8`, plus our own rule (a letter and a digit) checked in the actions before calling Better Auth; `autoSignIn: false` on sign up; `revokeSessionsOnPasswordReset: true`. `emailVerification.autoSignInAfterVerification: true` (AC-3). `changePassword` is called with `revokeOtherSessions: true`. After `resetPasswordEmailOTP`, the action sets `email_verified = true` if Better Auth did not (the code proved the address), so the following `signInEmail` passes `requireEmailVerification`.
- **Google**: `socialProviders.google` with `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; `account.accountLinking.enabled: true` with no `trustedProviders`, so Better Auth links only when Google reports the email verified.
- **Plugins**, in this order: `emailOTP({ otpLength: 6, expiresIn: 600, allowedAttempts: 3, storeOTP: "hashed", overrideDefaultEmailVerification: true, sendVerificationOnSignUp: true, sendVerificationOTP })` · `twoFactor({ issuer: "Aurevia Estates", twoFactorCookieMaxAge: 600 })` (no `skipVerificationOnEnable`, no trusted devices) · `nextCookies()` last. No captcha plugin: with the HTTP endpoints off, our actions check hCaptcha once with `verifyCaptcha` (`lib/server/captcha.ts`, already built), so each single use token is spent exactly once.
- **Rate limits**: Better Auth's limiter only runs on HTTP requests, so it is left at its defaults for the callback. Our own limiter, `lib/server/auth-limits.ts`, runs at the top of every public auth action and stores counts in the `rate_limits` table (`key`, `count`, `last_request`), keyed both by client IP (from `x-vercel-forwarded-for`, else `x-real-ip`, else `local`) and by lowercased email: sign in, sign up, and code entry 30 per 5 minutes per IP and 10 per 5 minutes per email; email sending 10 per hour per IP and 5 per hour per email; authenticator codes 5 wrong per pending sign in (below). It runs in tests and staging too; locally every request shares the `local` key.
- **Database hooks**:
  - `user.create.before`: lowercase the email; `full_name` defaults to `''`.
  - `session.create.before`: load the profile; if `deleted_at` is set, throw `APIError("FORBIDDEN", { code: "ACCOUNT_DELETED" })`, which the actions map to `account_deleted` (a bare `return false` gives a generic failure). If the request path is `/two-factor/verify-totp` or `/two-factor/verify-backup-code`, set `two_factor_verified_at = now`. If the profile's role is AGENT, set `expires_at = now + 12 hours`.
  - `session.update.before`: if the session belongs to an AGENT, drop any change to `expires_at`, so the daily refresh (`updateAge`) can't stretch the 12 hours to 30 days.
  - `account.create.before` (provider `google`): if the profile's `email_verified` is false, replace its credential password with a hash of 32 random bytes, then let the link proceed and set `email_verified = true` (Google verified the address).
  - Sign up for an email that already has an unverified credential account: `signUpWithPassword` replaces that account's password with the new one (the newest sign up wins), then sends a fresh confirmation code, so an attacker's earlier password never survives the real owner's confirmation.
- **Known per path behavior to confirm in task 5** (Better Auth source or a spike): password sign in with 2FA creates a session and the plugin then deletes it (the hook sees `/sign-in/email`, which is harmless); verifying the code creates the real session (the hook sees the verify path). If turning 2FA on replaces the current session, the hook covers it; if it keeps the session, an after hook on `/two-factor/verify-totp` sets `two_factor_verified_at` on it. Record which one applies in this spec.

### Email codes and links

`sendVerificationOTP({ email, otp, type })` in `lib/server/auth-emails.ts`:

| `type` | Template | Link |
|---|---|---|
| `sign-in` | "Your Aurevia sign in code". If the profile exists and `email_verified` is false, first replace its credential password (AC-13). | `/auth/confirm?type=sign-in&email=…&code=…&next=…` |
| `email-verification` | "Confirm your email" (password sign up) | `/auth/confirm?type=verify&email=…&code=…&next=…` |
| `forget-password` | "Reset your Aurevia password", or "Set your Aurevia password" when the account has no credential yet (AC-10) | `/auth/confirm?type=reset&email=…&code=…` (the new password is set on that page) |

The `next` value comes from the action that requested the code, held in an `AsyncLocalStorage` store (`lib/server/auth-request.ts`) that the action opens around its `auth.api.*` call, since the callback only receives email, code, and type. It goes through `safeNext`; with no store (any other caller) the link carries no `next`. The store is read before any `after()` work begins, so a background send keeps it.

**Per email cooldown** (60 seconds, all three types): checked inside `sendVerificationOTP` before anything is sent, from a `rate_limits` row we own, `key = "cooldown:<type>:<email>"`, `last_request` = when the last code was sent (epoch milliseconds). Inside the cooldown the callback throws `APIError` with code `RATE_LIMITED` (mapped to `rate_limited`), except for sign up and reset, where it skips the send silently so the response doesn't reveal the account.

**Sending**: Resend with the idempotency key `auth/<type>/<sha256 of email and code>`. `sign-in` and the set a first password reset are awaited and throw on failure (the action shows `email_send_failed`). `email-verification` and the ordinary reset are sent in `after()` and report failures to Sentry only (AC-13). Templates live in `emails/auth/*.tsx` with `locale: "en"`. Sentry and PostHog drop the query string of `/auth/confirm` URLs (a `beforeSend` scrub and PostHog's URL sanitizer, once PostHog lands).

### API surface

All actions validate with Zod; public ones then run `verifyCaptcha(captchaToken)` and the auth limiter, then call `auth.api.*` with `await headers()`, and return `{ ok: true, ... } | { ok: false, reason }`. Better Auth `APIError` codes are mapped to reasons in one table in `lib/server/auth-errors.ts`. Sign in actions live in `app/(auth)/actions.ts`, account actions in `app/account/actions.ts`.

| Action | Inputs | Better Auth call | Output | Auth | Key errors (reason) |
|---|---|---|---|---|---|
| `startGoogle` | `next?` | `signInSocial({ provider: "google", callbackURL: "/auth/continue?next=…", errorCallbackURL: "/sign-in?error=google_cancelled" })` | redirect to Google | public | `google_unavailable` |
| `requestEmailCode` | `email`, `captchaToken`, `next?` | `sendVerificationOTP({ type: "sign-in" })` | `{ ok, cooldownSeconds: 60 }` | public | `captcha_failed`, `rate_limited`, `email_send_failed` |
| `verifyEmailCode` | `email`, `code`, `purpose: "signin" \| "signup"`, `captchaToken`, `next?` | `signInEmailOTP` (signin) or `verifyEmail` OTP with auto sign in (signup) | redirect | public | `captcha_failed`, `otp_invalid`, `rate_limited`, `account_deleted` |
| `confirmEmailLink` | `email`, `code`, `type: "sign-in" \| "verify"`, `captchaToken`, `next?` | as `verifyEmailCode` | redirect | public | `link_invalid`, `captcha_failed`, `account_deleted` |
| `signUpWithPassword` | `email`, `password`, `captchaToken`, `next?` | `signUpEmail` (no session); for an existing unverified credential account, replace its password with this one and resend the code | `{ ok, step: "verify" }` | public | `weak_password`, `captcha_failed`, `rate_limited`; an existing email gets the same response, in the same time |
| `signInWithPassword` | `email`, `password`, `captchaToken`, `next?` | `signInEmail` | redirect, or redirect to `/sign-in?step=2fa&next=…` | public | `invalid_credentials`, `email_not_confirmed`, `captcha_failed`, `rate_limited`, `account_deleted` |
| `verifyTwoFactor` | `code`, `kind: "totp" \| "backup"`, `next?` | `verifyTOTP` or `verifyBackupCode` (uses the temporary 2FA cookie) | redirect | the 2FA cookie | `otp_invalid`, `two_factor_expired`, `too_many_attempts` (5 wrong codes per 2FA cookie, counted in `rate_limits` under `2fa:<cookie hash>`: the cookie is cleared, the user signs in again, Sentry gets the event) |
| `requestPasswordReset` | `email`, `captchaToken` | `forgetPasswordEmailOTP` (email sent after the response) | `{ ok }` always, same time either way | public | `captcha_failed`, `rate_limited` (per IP only, so it reveals nothing about the email) |
| `setNewPassword` | `email`, `code`, `password`, `captchaToken`, `next?` | `resetPasswordEmailOTP`, mark `email_verified`, then `signInEmail` with the new password | redirect, or redirect to `/sign-in?step=2fa&next=…` | the code | `weak_password`, `otp_invalid`, `captcha_failed` |
| `updateProfile` | `fullName`, `phone`, `countryCode` | Prisma update of `full_name`, `phone` | `{ ok }` | signed in | `invalid_phone`, `invalid_name` |
| `changePassword` | `currentPassword`, `password` | `changePassword({ revokeOtherSessions: true })` | `{ ok }` | signed in, has a credential | `invalid_credentials`, `weak_password`, `rate_limited` |
| `requestSetPasswordCode` | none (no captcha: signed in) | `forgetPasswordEmailOTP` for the user's own email, awaited | `{ ok, cooldownSeconds: 60 }` | signed in, no credential | `rate_limited`, `email_send_failed` |
| `setFirstPassword` | `code`, `password` | `resetPasswordEmailOTP` (ends other sessions) | `{ ok }` | signed in, no credential | `otp_invalid`, `weak_password` |
| `enableTwoFactor` | `password` | `enableTwoFactor` | `{ totpURI, secret, backupCodes }` | signed in, has a credential; agents: session within `freshAge` | `invalid_credentials`, `reauth_required` |
| `confirmTwoFactor` | `code`, `next?` | `verifyTOTP` (turns 2FA on) | `{ ok }`, then redirect to `next` | signed in | `otp_invalid` |
| `regenerateBackupCodes` | `password` | `generateBackupCodes` | `{ backupCodes }` | fresh session (2FA within 12 hours) | `invalid_credentials`, `mfa_required` |
| `disableTwoFactor` | `password` | `disableTwoFactor` | `{ ok }` | fresh session; not an agent | `invalid_credentials`, `mfa_required`, `agent_needs_2fa` |
| `linkGoogle` | none | `linkSocial({ provider: "google", callbackURL: "/account", errorCallbackURL: "/account?error=linking_failed" })` | redirect to Google | signed in | `linking_unavailable`, `identity_already_exists`, `linking_failed` |
| `unlinkMethod` | `accountId` | `unlinkAccount` | `{ ok }` | signed in; fresh session when 2FA is on | `last_method`, `mfa_required` |
| `signOut` | none | `signOut` | redirect to `/` | signed in | none |
| `signOutEverywhere` | none | `revokeSessions` | redirect to `/sign-in` | signed in | none |

**Sign in completion** (`completeSignIn(next)`, after every path that creates a session, and on `/auth/continue`): read the session with `auth.api.getSession`; if none, redirect to `/sign-in?error=link_invalid`; else redirect to `safeNext(next) ?? defaultLanding(profile.role)`. The deleted check already happened in `session.create.before`.

**Auth helpers** (`lib/server/auth.ts`, `import "server-only"`):

| Helper | Returns | Behavior |
|---|---|---|
| `getCurrentUser()` | `CurrentUser \| null` | `auth.api.getSession({ headers })` (a Neon read every call; the profile fields come back on the session's user, so no second query) → deleted or missing returns null. Never writes cookies |
| `getSessionUser()` | read only, spec 0003 | as above, for the header |
| `requireUser({ next })` | `CurrentUser` | null → `redirect("/sign-in?next=…")` |
| `requireAgent({ next })` | `AgentUser` | AC-8 order: session (none → sign in); role (not AGENT → `notFound()`); `two_factor_enabled` false → setup; `isAgentSessionFresh(session)` false (`two_factor_verified_at` null or older than 12 hours) → redirect to `/sign-in?next=…&error=agent_reauth`. It never revokes during render (a prefetch or double render must not end a session) |
| `requireAgentAction()` | `AgentUser` or `{ ok: false, reason: "signed_out" \| "not_found" \| "mfa_required" }` | the same checks without redirecting; a stale session is revoked here (an action may write cookies) and returns `mfa_required` |
| `isAgentSessionFresh(session)` | boolean | the shared predicate used by `requireAgent`, `requireAgentAction`, and `/sign-in`'s "already signed in" redirect, so the two pages never bounce between each other |
| `requireFreshTwoFactor()` | user or `{ ok: false, reason: "mfa_required" }` | `two_factor_verified_at` within 12 hours |
| `requireRole(...roles)` | user | for `"AGENT"` it delegates to `requireAgentAction()` |
| `safeNext`, `defaultLanding` | path | AC-11 and AC-12 |

`ForbiddenError` stays in `lib/server/errors.ts`. Every page under `app/dashboard/**` calls `requireAgent()` itself, and `tests/e2e/agent-gate.spec.ts` keeps checking that.

### Error messages

Spec 0004's table stands, with these changes: `mfa_required` now reads "Sign in again with your password and authenticator code." and redirects to `/sign-in`; `email_send_failed` comes from Better Auth's error when the email callback throws; `nonce_invalid`, `last_factor`, and `name_taken` are removed. New:

| Reason | Message |
|---|---|
| `agent_reauth` | For your security, agents sign in with a password and an authenticator code. |
| `two_factor_expired` | That took too long. Sign in again. |
| `agent_needs_2fa` | Agents must keep two step verification on. |
| `too_many_attempts` | Too many wrong codes. Sign in again. |
| `linking_failed` | We couldn't link that Google account. Try again. |
| `invalid_credentials` (on change password) | Your current password is wrong. |

### Value sourcing

| Action | Value produced / displayed | Source |
|---|---|---|
| Any sign in | landing path | `safeNext(next)` from the query or form, else `defaultLanding(profiles.role)` |
| Any email sending action | cooldown left | `rate_limits.last_request` for `cooldown:<type>:<email>`, against server time; 60 seconds |
| Public auth actions | rate limit counts | `rate_limits` rows keyed `ip:<path>:<client IP>` and `email:<path>:<email>`; client IP from `x-vercel-forwarded-for`, else `x-real-ip`, else `local` |
| verifyTwoFactor | wrong attempts | `rate_limits` row `2fa:<sha256 of the 2FA cookie>`, 5 allowed |
| verifyEmailCode, confirmEmailLink | code validity, attempts | Better Auth's `verifications` row (hashed code, expiry 600 seconds, 3 attempts) |
| Email callback | code, recipient, purpose | Better Auth's `{ otp, email, type }` |
| Email callback | link `next` | the requesting action's `next` through `safeNext`, from the `AsyncLocalStorage` store in `lib/server/auth-request.ts` |
| Email callback | await or background | `type`: `sign-in` and the set a first password reset awaited; `email-verification` and other resets in `after()` |
| `/sign-in` | which step to show after a reload | Better Auth's 2FA cookie present → authenticator step; `next` from `?next=` |
| Email callback | whether to replace the password | `profiles.email_verified` is false and `type` is `sign-in` |
| Google link | whether to replace the password | `profiles.email_verified` is false when the Google account is linked |
| Email callback | sender | `AUTH_EMAIL_FROM` |
| Google sign in | name, avatar | Google profile (`name`, `picture`) mapped to `full_name`, `avatar_url` |
| requireAgent | session valid now | `sessions` row by cookie token, not expired (Better Auth `getSession`) |
| requireAgent | role, deleted state, 2FA on | `profiles.role`, `profiles.deleted_at`, `profiles.two_factor_enabled` |
| requireAgent, requireFreshTwoFactor | code freshness | `sessions.two_factor_verified_at` against server time, 12 hours |
| Agent session length | expiry | `session.create.before` sets `expires_at` to creation plus 12 hours for AGENT; `session.update.before` keeps it |
| enableTwoFactor (agents) | sign in age | `sessions.created_at` within `freshAge` (15 minutes) |
| `/account/security` | backup codes left | count of unused codes in `two_factors.backup_codes` (decrypted by Better Auth's API) |
| Account page | linked methods | `listUserAccounts` (`accounts` rows: `credential`, `google`) |
| updateProfile | E.164 phone | `parsePhoneNumberFromString(phone, countryCode)` (unchanged from spec 0004) |
| Scripts | target database | `--env` flag loads `.env.staging` or `.env.production` (the Neon branch URLs) |
| Scripts | target user | `profiles` row by lowercased `email` |
| Scripts | operator name | `os.userInfo().username` |

### Scripts

`agent:promote` and `agent:demote` update `profiles.role` through Prisma, unchanged. `mfa:reset` runs in one transaction: delete the user's `two_factors` row, set `profiles.two_factor_enabled = false`, delete all of the user's `sessions` rows. No service role key exists any more; scripts use the env file's `DATABASE_URL`. Each run sends a Sentry event and calls `Sentry.flush()` before exit.

### Key invariants

- Authorization reads `profiles.role` from Neon on every request; never a cookie, token claim, or request field. `role`, `phone`, `deleted_at`, `two_factor_verified_at` are `input: false`.
- Every agent page and agent action passes `requireAgent()` or `requireAgentAction()`; an agent never reaches agent data without a session that passed the authenticator step within 12 hours.
- Sessions are read from the database on every request (no cookie cache), so revocation is immediate.
- `next` passes `safeNext()` everywhere, including in email links and Google callback URLs.
- Rendering never writes cookies; only server actions and the auth route set them (`nextCookies()`).
- Better Auth's HTTP endpoints are off except Google's callback; every other auth path is one of our actions, and every public action checks hCaptcha once and our database rate limiter before calling `auth.api.*`.
- A password set on an unverified email never survives a sign in code, a Google link, or a later sign up.
- Email codes are stored hashed, and their links never reach a Referer header, a cached page, Sentry, or PostHog with the code in them.
- Sign up and password reset answer in the same time whether or not the account exists.
- Public pages never call `getCurrentUser()`; the header uses `getSessionUser()` (spec 0003).

### Security model

- **Public**: `/sign-in` and `/auth/*` (their actions check captcha and rate limits on every email, password, and code path), and only Google's callback under `/api/auth/*`. Accepted: an authenticator code can be reused within its 30 second window (the plugin allows it).
- **Visitor**: own profile (name, phone, password, 2FA, linked methods, sessions). Cannot read or set `role`.
- **Agent**: everything a visitor can, plus agent pages and actions, only with a session that passed password plus authenticator code within 12 hours.
- **Operator**: promotion, demotion, and 2FA reset only through the scripts, run with the environment's database URL from a trusted machine.
- **Secrets**: `BETTER_AUTH_SECRET` signs cookies and encrypts 2FA secrets and backup codes; rotating it signs everyone out and breaks stored 2FA secrets, so it is set once per environment and kept in Vercel's encrypted env.
- **Personal data**: email, name, phone, avatar, IP address, and user agent (on `sessions`) are personal data; account deletion is feature 17.
- **Audit**: no auth audit log exists without Supabase. Sign in failures, agent gate denials, script runs, and email send failures go to Sentry; `sessions` rows show when and where each session was created. See Consequences.

### Configuration required

- `BETTER_AUTH_SECRET`: server only, 32 or more random bytes, one per environment (new).
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: server only, the Google Cloud OAuth client per environment, with the redirect URI `<site>/api/auth/callback/google` (new; previously held in Supabase's dashboard). Google accepts no wildcards, so staging uses one fixed domain (a Vercel alias such as `staging.<your domain>`) as its `NEXT_PUBLIC_SITE_URL`. Other preview deployments get email and password sign in only.
- Neon (not env): a minimum compute size above zero on `main`, so the first agent request after a quiet spell doesn't wait for the database to wake.
- `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_HCAPTCHA_SITE_KEY`, `HCAPTCHA_SECRET`, `AUTH_EMAIL_FROM`, `RESEND_API_KEY`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`: unchanged.
- `DATABASE_URL` (Neon pooled, `-pooler` host) and `DIRECT_URL` (Neon direct host): per Neon branch (spec 0001).
- Removed: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SEND_EMAIL_HOOK_SECRET`.
- New dependencies: `better-auth` (1.7.x, pinned), `@better-auth/prisma-adapter` if 1.7 ships the adapter separately. Removed: `@supabase/ssr`, `@supabase/supabase-js`, `standardwebhooks`. A QR library (`qrcode`) for the `totpURI`, since Better Auth returns a URI, not an image.

### Critical test scenarios

- Email code happy path on a Neon dev branch: request a code, read it from the Resend test inbox or the Sentry breadcrumb in dev, enter it, land on `next`, the profile exists with role VISITOR, verifies **AC-1**, **AC-2**, **AC-6**.
- Link prefetch: GET the `/auth/confirm` link, then open it in another browser and press Continue; signed in, verifies **AC-2**.
- Three wrong codes, then the right one: `otp_invalid` every time, verifies **AC-2**.
- Cooldown: a second request within 60 seconds is refused with the countdown, verifies **AC-2**.
- Unconfirmed password account: sign up, try the password; blocked with Send code, verifies **AC-3**.
- Captcha and closed endpoints: each public action without a token returns `captcha_failed` and sends nothing; direct POSTs to `/api/auth/email-otp/send-verification-otp`, `/api/auth/sign-in/email`, and `/api/auth/two-factor/disable` return 404, verifies **AC-4**.
- Rate limits: 31 sign in attempts from one IP in 5 minutes, and 11 for one email, each return `rate_limited`, verifies **AC-4**.
- Timing: a reset request for an existing and an unknown email take the same time (within 50 ms), verifies **AC-7**.
- Google cancel; Google with an existing verified email lands in the same profile, verifies **AC-5**.
- Pre registration: register `victim@` with a password, never verify; then (a) request a sign in code, (b) link Google, (c) sign up again with a second password and confirm; in each case the first password no longer signs in, verifies **AC-5**, **AC-13**.
- Tombstone: set `deleted_at`, sign in by each method; no session row is created, the message shows, verifies **AC-6**.
- Reset privacy and 2FA: unknown email gets the same message and no email; a 2FA user who resets lands on the code step, not a session, verifies **AC-7**.
- Agent gate order: signed out, visitor, agent without 2FA, agent signed in by email code, agent with a 13 hour old verification, agent with a fresh one each hit `/dashboard/leads`; they get sign in, 404, setup, the `/sign-in` password step (no redirect loop back to the dashboard), the same, the page, verifies **AC-8**.
- 2FA guessing: 5 wrong authenticator codes at the sign in step return `too_many_attempts`, the next try needs the password again, and Sentry has the event, verifies **AC-9**.
- Reload at the code step: reloading `/sign-in?step=2fa&next=/dashboard/leads` keeps the step and `next`, verifies **AC-8**.
- Revoked session: Sign out everywhere in browser B; browser A's next agent request is refused, verifies **AC-8**.
- Every dashboard page guarded (the page scan test), verifies **AC-8**.
- 2FA setup: enable with password, confirm a code, see 10 backup codes; sign in with a backup code once, the same code fails twice; an agent signed in 20 minutes ago is asked to sign in again; an agent cannot turn 2FA off, verifies **AC-9**.
- Phone and password: `01712345678` with BD saves `+8801712345678`; change password with a wrong current password fails; a Google only user sets a first password with an emailed code, verifies **AC-10**.
- Open redirect cases from spec 0004, verifies **AC-11**.
- Resend failure: make Resend fail; the user sees `email_send_failed`, Sentry has the event, verifies **AC-13**.
- Scripts: promote, then `mfa:reset`; the user's sessions are gone and 2FA is off, verifies **AC-14**.
- Session life: an agent session row has `expires_at` 12 hours after creation and keeps it after a request more than a day later (set `updated_at` back to force the refresh); a visitor's has 30 days and moves forward, verifies **AC-15**.
- Link hygiene: `/auth/confirm` answers with `Referrer-Policy: no-referrer` and `Cache-Control: no-store`, the address bar shows no query after load, and `verifications.value` holds no plain 6 digit code, verifies **AC-2**.
- No Supabase: `grep -ri supabase app lib components scripts proxy.ts package.json .env.example` finds nothing, verifies **AC-16**.

## Migration plan

**Strategy**: big bang onto a fresh database. There are no real users, the old database holds only sample data, and its migration history has drifted, so nothing is copied.
**Phases**:
1. Create the Neon project in `aws-ap-southeast-1` (spec 0001) with branches `main` (production), `staging`, and `dev`. Point `.env.local` at `dev`. Replay the repo's migrations, then the new auth migration, then `npm run db:seed -- --sample`.
2. Build tasks 1 to 6 below on the `dev` branch, with the Supabase code still present but unused from task 1 on.
3. Task 7 deletes the Supabase code. Deploy to staging (Vercel preview on the `staging` branch), verify, then production.
**Rollback**: until task 7 lands, revert the branch; the old Ohio project stays untouched until production runs on Singapore, then it is deleted.
**Risks**: Better Auth 1.7 field names differ from this spec's table (follow what the CLI generates, keep the database names here); `disabledPaths` might also block `auth.api.*` calls (task 1 checks this first; fallback: a `before` hook that rejects requests arriving over HTTP on every path but the callback); the `session.create.before` hook may not see the request path (fallback: an after hook on the two verify endpoints that updates the new session); `session.update.before` may not receive the role (fallback: look up the profile by `user_id` in the hook).

## Build plan

Tracer Bullet: one thin real thread first (email code in, session in Neon, landing, sign out) through every layer, then the other methods, then agents, then the account page, then removal.

1. Thin thread: the Neon project and branches (Migration plan phase 1); install `better-auth`; the auth migration in the safe sequence (profile changes plus `sessions`, `accounts`, `verifications`, `two_factors`, `rate_limits`); `lib/server/auth-config.ts` with the Prisma adapter, uuid v7 ids, the profile mapping, sessions without cookie cache, `disabledPaths` (confirm first that `auth.api.*` still works), the Vercel IP headers, `emailOTP` sign in with hashed codes, the deleted check hook with its `APIError`; `lib/server/auth-request.ts` (the `next` store), `lib/server/auth-errors.ts`; `lib/server/auth-emails.ts` with the sign in template and the unverified password guard; `/api/auth/[...all]`; `lib/server/auth.ts` rewritten on `getSession`; `proxy.ts` on `getSessionCookie`; `/sign-in` email code, `/auth/confirm` with its headers and query removal, `completeSignIn`, `signOut`, satisfies **AC-1**, **AC-2**, **AC-6**, **AC-11**, **AC-12**, **AC-13**, **AC-15**
2. Abuse controls: `verifyCaptcha` once in every public action, `lib/server/auth-limits.ts` (per IP and per email, on in every environment), the 60 second per email cooldown in the email callback, the Sentry and PostHog query scrub for `/auth/confirm`, satisfies **AC-2**, **AC-4**
3. Password: sign up with email verification and auto sign in, the newest sign up password rule, sign in, forgot password with the new password set on `/auth/confirm` or the `/sign-in` reset step, background sending and equal timing for sign up and reset, the confirm and reset templates, satisfies **AC-3**, **AC-4**, **AC-7**, **AC-13**
4. Google: `startGoogle`, `/auth/continue`, cancel handling, account linking with the unverified password guard, name and avatar, satisfies **AC-5**, **AC-6**
5. Agents: `twoFactor` plugin, the session hooks (verified time, 12 hour agent expiry, no extension on update; record which per path behavior applies), `verifyTwoFactor` on `/sign-in` with the 5 attempt lock and the server driven `?step=2fa`, `isAgentSessionFresh`, `requireAgent` (no revoke in render), `requireAgentAction`, `requireFreshTwoFactor`, `requireRole` delegation, the `/sign-in` redirect exception, `/account/security` (enable, confirm, backup codes, regenerate, disable; the promoted agent path through a first password), the dashboard gate test, and the three scripts, satisfies **AC-7**, **AC-8**, **AC-9**, **AC-14**, **AC-15**
6. Account page: name and phone with `displayName` (the `String` type change and every reader), change password ending other sessions, set a first password by code, linked methods (link Google with its error page, unlink), Sign out everywhere, satisfies **AC-10**, **AC-15**
7. Remove Supabase: `lib/supabase/`, `app/api/hooks/send-email/`, `app/(auth)/auth/callback/`, `/mfa`, `supabase/`, the Supabase packages and env keys from `lib/env.ts`, `lib/server/env.ts`, `.env.example`, and `playwright.config.ts`; rewrite `docs/runbooks/auth-config.md` for Better Auth and Google Cloud; rewrite `verify.md` for this spec, satisfies **AC-13**, **AC-16**

## Consequences

**Positive**:
- One vendor fewer: users, sessions, and codes live in our own Neon tables, visible to Prisma, with no second schema owner and no raw SQL foreign key into `auth`.
- No webhook on the critical path: emails are sent in process, and the Standard Webhooks secret and service role key are gone.
- Agents always sign in with something they know plus their phone, and their sessions die every 12 hours, which is simpler to reason about than spec 0004's freshness checks.
- One way into auth: Better Auth's HTTP endpoints are closed, so every rule (captcha, rate limits, agent checks) lives in our actions and can't be skipped.

**More negatives found in review**:
- Closing Better Auth's endpoints means we can't use its browser client or any plugin UI; every new auth feature needs its own action.
- We own the rate limiter and the 2FA attempt lock, two more pieces of security code to test.
- Staging needs a fixed domain for Google; other preview deployments can't test Google sign in.

**Negative / tradeoffs**:
- We now own auth security: password hashing, code storage, session revocation, and 2FA secrets run in our code and our database. Better Auth upgrades (it had a breaking 1.7 release) need care and a test run.
- No auth audit log any more (Supabase kept one). Answering "who signed in where" means reading `sessions` rows (gone once a session ends) and Sentry events.
- Agents lose Google and email code sign in, and keep only one authenticator plus backup codes; a lost phone without saved backup codes needs `mfa:reset`.
- Every signed in request reads the session from Neon (no cookie cache): one indexed query per request, plus the profile read.
- A visitor who only reads pages (no actions) keeps the cookie set at sign in; after 30 days without an action they are signed out even though they kept visiting.
- `full_name` changes from nullable to `''`, so every reader must use `displayName`.
- Leaked password protection (a Supabase Pro feature in spec 0004) is not included.

**Neutral**:
- Spec 0001 changes with this spec: Neon in Singapore instead of Supabase, Better Auth instead of Supabase Auth, photos in Neon (feature 20), no Supabase Storage.
- `/mfa`, `/auth/callback`, and the email hook disappear; `/auth/continue` and `/api/auth/*` appear.

## Follow-up

- [ ] `/sync`: update root `AGENTS.md` (stack, skills, `lib/supabase/AGENTS.md` removed, `app/AGENTS.md` without the email hook), and `lib/server/AGENTS.md` for `auth-config.ts` and `auth-emails.ts`.
- [ ] Update spec 0002: `profiles` gains `email_verified`, `two_factor_enabled`, a not null unique `email`, and a not null `full_name`; the auth tables join the data model; `leads.anonymized_at` is not part of it.
- [ ] Update spec 0005's follow up: feature 20 copies linked photos into Neon (spec 0001's photo rule), not Supabase Storage.
- [ ] Verify while building and record here: the 1.7 field names from `npx auth@latest generate`; that `disabledPaths` leaves `auth.api.*` working; whether `session.create.before` sees the request path; whether turning 2FA on replaces the session; whether `session.update.before` receives the role; how `revokeSessions` and `getSession` behave right after `mfa:reset`.
- [ ] Consider Better Auth's Have I Been Pwned plugin before launch (replaces Supabase's leaked password protection).
- [ ] Revisit an app audit table for access control events when there are more than a handful of agents.
- [ ] MCP servers you chose to connect (a user config step): Neon (`npx neon@latest mcp`, server `https://mcp.neon.tech/mcp`) and Better Auth docs (`npx auth@latest mcp --claude-code`).
- [ ] Bangla auth emails and sign in page when Bangla across the site is designed.

## References

**Project sources**: spec 0001 (stack and conventions), spec 0002 (data model, `profiles`), spec 0004 (the superseded design and its acceptance criteria), the `better-auth/skills` and `neondatabase/agent-skills` skills in `.claude/skills/`.

**Practices and standards**: one schema owner per schema; deny by default authorization in one server helper; step up authentication for privileged roles; strangler versus big bang migration (big bang chosen because no live data exists).

**Links** (verified during this design):
- Better Auth 1.7 upgrade guide: https://better-auth.com/docs/guides/1-7-upgrade-guide
- Better Auth Prisma adapter: https://www.better-auth.com/docs/adapters/prisma
- Better Auth database concepts: https://better-auth.com/docs/concepts/database
- Better Auth email OTP plugin: https://www.better-auth.com/docs/plugins/email-otp
- Better Auth two factor plugin: https://www.better-auth.com/docs/plugins/2fa
- Better Auth rate limiting: https://www.better-auth.com/docs/concepts/rate-limit
- Better Auth Next.js integration: https://better-auth.com/docs/integrations/next
- Neon regions: https://neon.com/docs/introduction/regions
- Neon connection pooling: https://neon.com/docs/connect/connection-pooling
- Neon plans: https://neon.com/docs/introduction/plans
