# 0004. Visitor and agent sign in

**Date**: 2026-10-17
**Status**: In Progress

## Summary

People sign in on one `/sign-in` page with Google, a 6 digit email code (the email also carries a link), or an email and password. New accounts must confirm their email, and an invisible hCaptcha check guards every form so bots can't mint accounts that burn the AI budget. Agents use the same methods but must also pass an authenticator app code (MFA), renewed every 12 hours, before any agent page opens; a visitor who tries an agent page just sees "not found". Auth emails are our own branded React Email templates, sent through Resend by a signed Supabase hook.

## Requirements

**User stories**:
- As a visitor, I want to sign in with Google, an email code, or a password, so I can chat and book without friction.
- As a visitor reading email on my phone, I want a code I can type, so sign in works whatever app opens the email.
- As a visitor who clicked "Ask the assistant", I want to land back where I was after signing in.
- As an agent, I want my account protected by a second factor, because it opens every lead's contact details.
- As an agent who lost my phone, I want a backup factor and a way back in.
- As a signed in user, I want to edit my name and phone, manage my password, MFA, and linked sign in methods, and sign out of all devices.
- As the owner, I want sign up protected from bots, so throwaway accounts can't drain the AI budget.

**Acceptance criteria**:
- **AC-1**: `/sign-in` offers Continue with Google, Email code, and Password (sign in or create account), plus Forgot password. It accepts a `next` query value; after any successful sign in the user lands on `next` when it passes `safeNext`, else on the default landing (AC-12). A user who is already signed in and opens `/sign-in` is redirected the same way at once.
- **AC-2**: Email code: submitting an email sends one email with a 6 digit code and a link. Entering the code on the page, or opening the link in any browser and pressing Continue, signs the user in (creating the account on first use). Opening the link without pressing Continue (as mail scanners do) does not use it up. The code expires after 10 minutes and works once; a wrong, used, or expired code shows the `otp_invalid` message. The same email can request a new code at most once per 60 seconds; the button shows the countdown.
- **AC-3**: Password sign up: an 8+ character password with at least one letter and one digit creates the account but no session; the user is shown the code entry step, and only after confirming (code or link) are they signed in. Signing in with a password before confirming shows the `email_not_confirmed` message with a Send code action.
- **AC-4**: Every sign up, password sign in, email code request, and password reset request carries an hCaptcha token that Supabase verifies; every code entry carries one that our action verifies with hCaptcha before calling Supabase. A request without a valid token is rejected with the `captcha_failed` message, no email is sent, and the widget resets. Google sign in and the `/auth/confirm` Continue button do not use the captcha.
- **AC-5**: Google: Continue with Google signs in or creates the account and returns to `next`. If the user cancels at Google or Google returns an error, they are back on `/sign-in` with the `google_cancelled` message and nothing else changes. A Google sign in with the same verified email as an existing account signs into that same account (same profile, same chats).
- **AC-6**: The profile is created (role VISITOR, spec 0002) before the first redirect after any sign in, filling `full_name` and `avatar_url` from Google when present. A user whose profile has `deleted_at` set is signed out at that same point and shown the `account_deleted` message.
- **AC-7**: Forgot password: requesting a reset always shows "If that email has an account, we've sent a code." The code or link opens the "Set a new password" step; a user with a verified MFA factor first passes the `/mfa` check. The new password follows the rule, and the user is then signed in.
- **AC-8**: Agent pages (everything under `/dashboard`) and agent actions: a signed out user is redirected to `/sign-in?next=<path>`; a signed in non agent gets a 404 page; an agent with no verified authenticator is sent to `/account/security?setup=required&next=<path>`; an agent whose session is not `aal2`, or whose last authenticator code is older than 12 hours, is sent to `/mfa?next=<path>`. The check confirms the session with Supabase on each request, so after `mfa:reset` or Sign out everywhere the old session gets nothing. Every agent server action applies the same check and returns `{ ok: false, reason }` instead of acting.
- **AC-9**: MFA: from `/account/security` a user can enroll an authenticator (QR code plus a manual key, with a name chosen at enrollment) and confirm it with a code. An agent can enroll only within 15 minutes of signing in; otherwise they are asked to sign in again first. Unverified factors older than one hour are removed when the page loads. Agents with only one factor see a persistent prompt to add a backup. Adding a second factor, removing a factor, or unlinking a method needs a code entered within the last 12 hours; an agent cannot remove their last factor. After setup or a code, the user lands on `next` when it passes `safeNext`.
- **AC-10**: Account page (`/account`): a signed in user can edit `full_name` (1 to 80 characters) and `phone` (any country, Bangladesh preselected, validated and saved in E.164); set or change their password (a reauthentication code is emailed and entered with the new password); see their linked sign in methods, link Google, and unlink a method while at least one other remains; sign out of this device; sign out everywhere (all sessions, then back to `/sign-in`).
- **AC-11**: `safeNext` accepts only same site paths: the value parsed with `new URL(value, NEXT_PUBLIC_SITE_URL)` has the site's origin; the raw value starts with a single `/`, has no backslash, no character below `0x20`, no `%5c` or `%2f` (any case), is under 512 characters, and is not under `/auth/` or `/api/`. Anything else is ignored silently. All redirects are built from `NEXT_PUBLIC_SITE_URL`, never the request `Host`.
- **AC-12**: Default landing: role AGENT goes to `/dashboard/leads` (through the MFA check); everyone else goes to `/assistant`.
- **AC-13**: Auth emails (code sign in, sign up confirmation, password reset, reauthentication) are rendered from React Email templates in the brand style and sent through Resend by the Send Email Hook. The hook rejects any request whose signature fails, sends the email before it answers, and a Resend failure makes the hook fail so the user sees the `email_send_failed` message. Each email contains the code; all but reauthentication also contain a link to `/auth/confirm`. Before sending a sign in code to an account whose email was never confirmed, the hook replaces that account's password with a random one.
- **AC-14**: Scripts: `npm run agent:promote -- <email> --env <staging|production>` sets role AGENT, `agent:demote` sets VISITOR, and `mfa:reset` removes every MFA factor and ends every session for that user. On production each asks the operator to type the email again. Each takes effect on the user's next request, refuses unknown emails, prints the reminder "Ask the agent to sign in and add their authenticator now", and reports to Sentry with the operator's machine user name.
- **AC-15**: Sessions: a signed in visitor stays signed in across browser restarts (access token refreshed silently through `proxy.ts`). Sign out ends the current device's session only (`scope: "local"`); Sign out everywhere ends all of them (`scope: "global"`).

## Decision

**Chosen option**: Option 1: Supabase Auth with server actions on one `/sign-in` page, email codes plus interstitial `token_hash` links, hCaptcha, our own Send Email Hook, and app enforced agent MFA with a 12 hour freshness window.

All auth calls run in server actions and route handlers with the `@supabase/ssr` server client; the browser never holds the service role key and never talks to the database. Authorization lives in `lib/server/auth.ts` (spec 0001), extended with `requireAgent()`, `requireFreshMfa()`, and the MFA freshness check.

**Implementation skills**: `supabase` (`supabase/agent-skills`, `.claude/skills/supabase/`) · `resend` (`resend/resend-skills`, `.claude/skills/resend/`) · `react-email` (`resend/react-email`, `.claude/skills/react-email/`) · `receiving-webhooks` (`standard-webhooks/standard-webhooks`, `.claude/skills/receiving-webhooks/`) · `sentry-nextjs-sdk` (`getsentry/sentry-for-ai`, `.claude/skills/sentry-nextjs-sdk/`) · `prisma-client-api` (`prisma/skills`, `.claude/skills/prisma-client-api/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

### Data model

No schema change. This feature uses spec 0002's `profiles` columns (`role`, `email`, `full_name`, `phone`, `avatar_url`, `deleted_at`) and spec 0003's `theme_preference`. Supabase keeps sessions, MFA factors, and linked identities in its own `auth` schema. The app writes to `auth` only through Supabase APIs, except the session delete in `mfa:reset`.

Profile creation happens in `ensureProfile(user)`: `insert ... on conflict (id) do nothing` with `email` from the verified user, and `full_name` and `avatar_url` from the Google identity data when present. These fields are display data only; nothing reads `user_metadata` for authorization. `ensureProfile` runs in every sign in completion path (below), so `getSessionUser()` (spec 0003) sees the profile on the very first page after sign in.

### State transitions

Session strength for agents (checked on each request, not stored):

`signed out` → (any sign in method) → `aal1` → (has verified factor and enters code) → `aal2 fresh` → (12 hours since the last TOTP verification) → `aal2 stale` → (enters code) → `aal2 fresh`.
An agent with no verified factor is held at `aal1` and routed to setup. Visitors stop at `aal1`, or `aal2` if they chose to enroll; nothing visitor facing requires `aal2`, but managing factors does (AC-9). Sellers (later) follow visitors: no MFA requirement, since they only touch their own listings.

### Routes and pages

All auth pages read cookies or `searchParams`, so each renders its dynamic part inside `<Suspense>` (required with Cache Components, spec 0001) and is never cached.

| Path | Kind | What it does |
|---|---|---|
| `/sign-in` | page | steps: choose method → enter code or password → done; reads `next` and `error`; signed in users are redirected (AC-1) |
| `/auth/callback` | route handler GET | Google OAuth return and identity linking: `exchangeCodeForSession(code)`, `completeSignIn()`, redirect to `next`; an `error` param redirects to `/sign-in?error=google_cancelled`, or to `/account?error=<code>` when linking |
| `/auth/confirm` | page | email links land here; shows "Continue signing in" with a button; GET never touches the token (mail scanners can open it safely); `type` must be `email` or `recovery`, else `link_invalid` |
| `/sign-in/new-password` | page | set a new password after a recovery sign in; agents and MFA users pass `/mfa` first |
| `/mfa` | page | TOTP challenge; factor picker defaults to the most recently verified factor |
| `/account` | page, signed in | name and phone, password, linked methods, sign out actions |
| `/account/security` | page, signed in | MFA factors: enroll (name set here), verify, remove; `setup=required` banner for agents |
| `/api/hooks/send-email` | route handler POST | Supabase Send Email Hook (below) |

`proxy.ts` (spec 0001) matcher: every path except `/_next/static`, `/_next/image`, `/api/hooks/`, `favicon.ico`, and files with an extension. It refreshes the session cookie and does one cheap redirect: no session cookie on `/account`, `/dashboard`, `/mfa`, or `/assistant` → `/sign-in?next=<path>`. It is never the security check.

### Redirect URLs

Every Supabase call that sends an email or starts OAuth passes a redirect built the same way: `${origin}/auth/<confirm|callback>?next=${encodeURIComponent(safeNext(next) ?? "")}`, where `origin` is `NEXT_PUBLIC_SITE_URL`. The Supabase redirect allow list uses wildcards: `<site>/auth/callback**`, `<site>/auth/confirm**`, and on staging `https://*-<team>.vercel.app/auth/**`.

| Call | Redirect |
|---|---|
| `signInWithOtp` (email code) | `emailRedirectTo` → `/auth/confirm?next=…` |
| `signUp` (password) | `emailRedirectTo` → `/auth/confirm?next=…` |
| `resetPasswordForEmail` | `redirectTo` → `/auth/confirm?next=/sign-in/new-password` |
| `signInWithOAuth` (Google) | `redirectTo` → `/auth/callback?next=…` |
| `linkIdentity` (Google) | `redirectTo` → `/auth/callback?next=/account&link=1` |

The Send Email Hook builds the email link from the payload's `redirect_to`: it takes that URL's origin only if it is `NEXT_PUBLIC_SITE_URL` or a staging preview origin, and its `next` query value only after `safeNext`; the link is `${thatOrigin}/auth/confirm?token_hash=<token_hash>&type=<email|recovery>&next=<next>`. Previews therefore get preview links.

### API surface

All actions validate input with Zod and return `{ ok: true, ... } | { ok: false, reason }`; the UI shows the message for `reason` from the *Error messages* table. Sign in actions live in `app/(auth)/actions.ts`, account actions in `app/account/actions.ts`.

| Action / handler | Inputs | Output | Auth | Key errors (reason) |
|---|---|---|---|---|
| `startGoogle` | `next?` | redirect to Google | public | `google_unavailable` |
| `requestEmailCode` | `email`, `captchaToken`, `next?` | `{ ok, cooldownSeconds: 60 }` | public | `captcha_failed`, `rate_limited`, `email_send_failed` |
| `verifyEmailCode` | `email`, `token` (6 digits), `purpose: "signin" \| "signup" \| "recovery"`, `captchaToken`, `next?` | redirect | public | `captcha_failed`, `otp_invalid`, `rate_limited`, `account_deleted` |
| `confirmEmailLink` (the Continue button on `/auth/confirm`) | `tokenHash`, `type: "email" \| "recovery"`, `next?` | redirect | public | `link_invalid`, `account_deleted` |
| `resendSignupCode` | `email`, `captchaToken` | `{ ok, cooldownSeconds: 60 }` | public | `captcha_failed`, `rate_limited` (uses `auth.resend({ type: "signup" })`) |
| `signUpWithPassword` | `email`, `password`, `captchaToken`, `next?` | `{ ok, step: "verify" }` | public | `weak_password`, `captcha_failed`; an existing email gets the same response (no account enumeration) |
| `signInWithPassword` | `email`, `password`, `captchaToken`, `next?` | redirect | public | `invalid_credentials`, `email_not_confirmed`, `captcha_failed`, `account_deleted` |
| `requestPasswordReset` | `email`, `captchaToken` | `{ ok }` always | public | `captcha_failed` |
| `setNewPassword` | `password` | redirect to landing | recovery session (plus fresh MFA when the user has a verified factor) | `weak_password`, `mfa_required` |
| `updateProfile` | `fullName`, `phone`, `countryCode` | `{ ok }` | signed in | `invalid_phone`, `invalid_name` |
| `requestReauth` | none | `{ ok, cooldownSeconds: 60 }` | signed in | `rate_limited` (calls `auth.reauthenticate()`) |
| `changePassword` | `password`, `nonce` | `{ ok }` | signed in (plus fresh MFA when the user has a verified factor) | `weak_password`, `nonce_invalid`, `mfa_required` (calls `updateUser({ password, nonce })`) |
| `enrollFactor` | `friendlyName` (1 to 40 characters) | `{ factorId, qrCode, secret }` | signed in; agents: signed in within 15 minutes; second factor: fresh MFA | `name_taken`, `reauth_required`, `mfa_required` |
| `verifyFactor` | `factorId`, `code` | `{ ok }`, then redirect to `next` | signed in | `otp_invalid` |
| `removeFactor` | `factorId` | `{ ok }` | fresh MFA | `last_factor` (agents), `mfa_required` |
| `challengeMfa` | `factorId`, `code`, `next?` | redirect | signed in | `otp_invalid` |
| `linkGoogle` | none | redirect to Google | signed in | `linking_unavailable` |
| `unlinkIdentity` | `identityId` | `{ ok }` | fresh MFA when the user has a verified factor | `last_method`, `mfa_required` |
| `signOut` | none | redirect to `/` | signed in | none; `signOut({ scope: "local" })`, always clears cookies |
| `signOutEverywhere` | none | redirect to `/sign-in` | signed in | none; `signOut({ scope: "global" })` |
| `POST /api/hooks/send-email` | raw body + `webhook-id`, `webhook-timestamp`, `webhook-signature` | `200 {}` | Standard Webhooks signature with `SEND_EMAIL_HOOK_SECRET` | `401` bad signature; `400` unsupported action type; `500` with `{ error: { http_code, message } }` on Resend failure |

`verifyEmailCode` maps `purpose` to the Supabase type: `signin` and `signup` → `verifyOtp({ email, token, type: "email" })`; `recovery` → `type: "recovery"`. It first verifies `captchaToken` with hCaptcha's `siteverify` endpoint (`HCAPTCHA_SECRET`), since Supabase does not apply its captcha to code verification.

**Sign in completion** (`completeSignIn(next)`, called by `verifyEmailCode`, `confirmEmailLink`, `signInWithPassword`, `setNewPassword`, `challengeMfa`, and `/auth/callback`): get the user with `auth.getUser()`, run `ensureProfile`; if the profile has `deleted_at`, call `signOut({ scope: "local" })` and redirect to `/sign-in?error=account_deleted`; else redirect to `safeNext(next) ?? defaultLanding(profile)`.

**Auth helpers** (`lib/server/auth.ts`, `import "server-only"`):

| Helper | Returns | Behavior |
|---|---|---|
| `getCurrentUser()` | `CurrentUser \| null` | `getClaims()` (signature check) → profile; a tombstoned or missing profile returns null. Never writes cookies (safe in render) |
| `getSessionUser()` | read only, spec 0003 | as above, used by the header |
| `requireUser({ next })` | `CurrentUser` | null → `redirect("/sign-in?next=...")` |
| `requireAgent({ next })` | `AgentUser` | AC-8 order. Uses `auth.getUser()` (a Supabase round trip that fails once the session is revoked), then the profile role (not AGENT → `notFound()`), then `mfa.listFactors()` (no verified TOTP → setup), then `mfa.getAuthenticatorAssuranceLevel()` and the claims' `amr` (not `aal2`, or the newest `totp` entry older than 12 hours → `/mfa`) |
| `requireAgentAction()` | `AgentUser` or `{ ok: false, reason: "signed_out" \| "not_found" \| "mfa_required" }` | the same checks for server actions, without redirecting |
| `requireFreshMfa()` | user or `{ ok: false, reason: "mfa_required" }` | `aal2` and a `totp` `amr` entry within 12 hours; used for factor and identity changes |
| `requireRole(...roles)` (spec 0001) | user | for `"AGENT"` it delegates to `requireAgentAction()`; never a path around MFA |
| `safeNext(value)`, `defaultLanding(profile)` | path | AC-11 and AC-12 rules |

Every page under `app/dashboard/**` calls `requireAgent()` itself (the layout may call it too, but layouts do not rerun on client navigation), and every agent action calls `requireAgentAction()` first. A lint rule can't reliably tell whether a page calls the check, so a test walks every `app/dashboard/**/page.tsx` and fails if the file does not import `requireAgent`.

**Send Email Hook** (`app/api/hooks/send-email/route.ts`): read the raw body with `await req.text()`; verify with `new Webhook(secret)` from `standardwebhooks`, where `secret` is `SEND_EMAIL_HOOK_SECRET` with its `v1,whsec_` prefix removed. Branch on `email_data.email_action_type`:
- `signup` → "Confirm your email" (code plus link, `type=email`).
- `magiclink` (the email code sign in) → "Your Aurevia sign in code" (code plus link, `type=email`). If `user.email_confirmed_at` is null, first call `auth.admin.updateUserById(user.id, { password: <32 random bytes> })` with the service role client, so a password set by someone else before confirmation stops working.
- `recovery` → "Reset your Aurevia password" (code plus link, `type=recovery`).
- `reauthentication` → "Confirm it's you" (code only).
- `invite`, `email_change`, anything else → `400` (not used by this app).

Send through Resend with the idempotency key `auth/<webhook-id>`, await the result, then reply `200 {}`. Templates live in `emails/auth/*.tsx` with a `locale: "en"` prop. The handler must finish within Supabase's hook timeout (5 seconds). The service role client here is the one request time use of the service role key, limited to that password replacement.

### Error messages

| Reason | Message |
|---|---|
| `otp_invalid` | That code didn't work. Check it or send a new one. |
| `link_invalid` | That link has expired or was already used. Send yourself a new code. |
| `captcha_failed` | Please try again. (the hCaptcha widget resets) |
| `rate_limited` | Please wait a moment before trying again. (with the countdown when known) |
| `email_send_failed` | We couldn't send the email. Try again in a minute. (Supabase error code `hook_error` or a 5xx from the hook) |
| `email_not_confirmed` | Confirm your email first. [Send code] |
| `invalid_credentials` | Email or password is wrong. |
| `weak_password` | Use at least 8 characters with a letter and a number. |
| `google_cancelled` | Google sign in was cancelled. |
| `google_unavailable` | Google sign in isn't available right now. Try email instead. |
| `account_deleted` | This account has been deleted. |
| `mfa_required` | Enter a code from your authenticator app to continue. (redirects to `/mfa`) |
| `reauth_required` | For your security, sign in again to set up an authenticator. |
| `nonce_invalid` | That confirmation code didn't work. |
| `last_factor` | Add another authenticator before removing this one. |
| `last_method` | You need at least one way to sign in. |
| `identity_already_exists` | That Google account is already linked to another Aurevia account. |
| `linking_unavailable` | Linking isn't available right now. |
| `invalid_phone` | Enter a valid phone number. |
| `invalid_name` | Enter a name up to 80 characters. |
| `name_taken` | You already have an authenticator with that name. |

### Value sourcing

| Action | Value produced / displayed | Source |
|---|---|---|
| Any sign in | landing path | `safeNext(next)` from the query or form, else `defaultLanding(profile)` from `profiles.role` |
| requestEmailCode | cooldown shown | constant 60 seconds, matching Supabase's per email send frequency |
| verifyEmailCode | Supabase OTP type | `purpose` input, set by the step that showed the code entry (sign in, sign up, or recovery) |
| Send Email Hook | code, token hash, recipient | payload `email_data.token`, `email_data.token_hash`, `user.email` |
| Send Email Hook | link origin and `next` | payload `email_data.redirect_to`, origin checked against `NEXT_PUBLIC_SITE_URL` or the staging preview pattern, `next` through `safeNext` |
| Send Email Hook | whether to replace the password | payload `user.email_confirmed_at` is null and the action is `magiclink` |
| Send Email Hook | sender | `AUTH_EMAIL_FROM` |
| completeSignIn | name, avatar | Google identity data (`full_name` or `name`, `avatar_url` or `picture`) when present, else null |
| requireAgent | session valid now | `auth.getUser()` |
| requireAgent | role, deleted state | `profiles.role`, `profiles.deleted_at` |
| requireAgent | has a verified factor | `auth.mfa.listFactors()` |
| requireAgent, requireFreshMfa | code freshness | newest `amr` entry with `method: "totp"`, its `timestamp`, against server time |
| enrollFactor (agents) | sign in age | newest `amr` entry's `timestamp`, within 15 minutes |
| `/mfa` | default factor | the verified factor with the latest `updated_at` from `listFactors()` |
| `/account/security` | stale unverified factors | `listFactors()` entries with status `unverified` and `created_at` over one hour old, removed with `mfa.unenroll` |
| updateProfile | E.164 phone | `parsePhoneNumberFromString(phone, countryCode)` from `libphonenumber-js/min` |
| Phone country select | country list and names | `getCountries()` from `libphonenumber-js`, names from `Intl.DisplayNames(["en"], { type: "region" })`, sorted by name with Bangladesh first |
| Account page | linked methods | `auth.getUserIdentities()` |
| Scripts | target project | `--env` flag → loads `.env.staging` or `.env.production` (git ignored) |
| Scripts | target user | `profiles` row by lowercased `email` |
| Scripts | operator name in the Sentry event | `os.userInfo().username` |

### Supabase Auth configuration

Set in `supabase/config.toml` for local and mirrored in the staging and production dashboards. The checklist lives in `docs/runbooks/auth-config.md`.

- Providers: Email (confirm email on, secure password change on, OTP length 6, OTP expiry 600 seconds), Google (client id and secret per environment). Phone off. Anonymous sign ins off.
- Password: minimum 8, required characters "letters and digits". Leaked password protection on once the project is on Pro.
- Identity linking: automatic linking (default) on; manual linking on.
- MFA: TOTP enroll and verify on; up to 10 factors per user (default).
- Captcha: hCaptcha with the secret per environment; local uses hCaptcha's test keys (site key `10000000-ffff-ffff-ffff-000000000001`, matching test secret).
- Rate limits: emails sent 100 per hour (also check the Resend plan's daily cap); sign ups and sign ins 30 per 5 minutes per IP; token verifications 30 per 5 minutes per IP; per email send frequency 60 seconds.
- Hooks: Send Email Hook, HTTPS, URL `<site>/api/hooks/send-email`, secret generated by Supabase. Custom SMTP off.
- URLs: site URL per environment; redirect allow list as in *Redirect URLs*.
- Sessions: JWT expiry 3600 seconds; refresh token rotation on; no time box or inactivity timeout.

### Scripts

`scripts/agent-promote.ts`, `scripts/agent-demote.ts`, `scripts/mfa-reset.ts`, run as `tsx --conditions react-server scripts/<name>.ts` (so `server-only` imports resolve) through `package.json` scripts. Each loads the env file for `--env`, prints the target project ref, and on production asks the operator to type the email again. `mfa:reset` lists the user's factors with `auth.admin.mfa.listFactors({ userId })`, deletes each with `auth.admin.mfa.deleteFactor`, then runs `delete from auth.sessions where user_id = $1` over the Prisma direct connection. Each run sends a Sentry event and calls `Sentry.flush()` before exit.

### Key invariants

- Authorization reads `profiles.role` from the database on every request; never a JWT claim or `user_metadata`.
- Every agent page and agent action passes `requireAgent()` or `requireAgentAction()`, which confirm the session with Supabase; `requireRole("AGENT")` delegates to them.
- An agent never reaches agent data without a TOTP code verified in the last 12 hours.
- Factor and identity changes need a fresh code once any factor exists.
- `next` passes `safeNext()` everywhere, including inside the email hook.
- Rendering never writes cookies; sign out on a tombstone happens only in `completeSignIn`.
- The service role key is used by the scripts and, at request time, only by the hook's password replacement.
- Public pages never call `getCurrentUser()`; the header uses `getSessionUser()` (spec 0003).
- Auth emails are sent only by the signed hook.

### Security model

- **Public**: `/sign-in`, `/auth/*`, and the hook endpoint (signature required). Public auth requests go through hCaptcha and Supabase's rate limits; code entry also goes through our hCaptcha check.
- **Visitor**: own profile (name, phone, password, factors, identities, sessions). Cannot read or set `role`.
- **Agent**: everything a visitor can, plus agent pages and actions, only with a confirmed, fresh `aal2` session.
- **Seller** (later): as visitor; no MFA requirement.
- **Operator**: promotion, demotion, and MFA reset only through the scripts, run with the service role key from a trusted machine.
- **Account pre registration**: the hook replaces the password of a never confirmed account before sending it a sign in code, so an attacker who pre registered the victim's email cannot keep a working password.
- **Personal data**: email, name, phone, and avatar are personal data; account deletion is feature 17.
- **Audit**: the engineer chose no app audit table. Supabase's auth audit log records sign ins, sign ups, factor enroll and remove, password changes, and identity links; operator script runs, `requireAgent` denials, and hook failures go to Sentry. See Consequences.

### Configuration required

- `NEXT_PUBLIC_SITE_URL`: canonical origin per environment, used for every redirect and email link.
- `NEXT_PUBLIC_HCAPTCHA_SITE_KEY`: hCaptcha site key (public).
- `HCAPTCHA_SECRET`: server only, for our own `siteverify` check on code entry (the same secret Supabase holds).
- `SEND_EMAIL_HOOK_SECRET`: server only, the Standard Webhooks secret Supabase shows when the hook is created.
- `AUTH_EMAIL_FROM`: sender on the Resend verified domain, for example `Aurevia Estates <hello@<your domain>>`.
- `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`: already listed in spec 0001; first used here.
- Supabase dashboard only: Google OAuth client per environment, hCaptcha secret, hook URL and secret, rate limits, password and MFA settings.
- Third party accounts needed before coding: hCaptcha (site key and secret), a Google Cloud OAuth client (consent screen with the Aurevia name and logo), a Resend verified domain, and a Sentry project.
- New dependencies: `@hcaptcha/react-hcaptcha`, `libphonenumber-js`, `standardwebhooks`, `resend`, `@react-email/components`, `@sentry/nextjs` (minimal init here; feature 18 completes it). Dev: `tsx`. No QR library, since Supabase returns the QR code as an SVG.

### Critical test scenarios

- Email code happy path: request a code, read it from the local inbox, enter it, land on `next`, profile exists on that first page, verifies **AC-1**, **AC-2**, **AC-6**.
- Link prefetch: GET the `/auth/confirm` link (as a scanner would), then open it in another browser and press Continue; signed in, verifies **AC-2**.
- Expired and reused code: both show `otp_invalid`, verifies **AC-2**.
- Cooldown: a second request within 60 seconds is refused with the countdown, verifies **AC-2**.
- Unconfirmed password account: sign up, try the password; blocked, Send code works, verifies **AC-3**.
- Captcha: the sign up action and the code entry action each reject a missing token; no email sent, verifies **AC-4**.
- Google cancel: deny consent; back on `/sign-in` with the message, verifies **AC-5**.
- Same email: password account confirmed, then Google with that email; same profile id, verifies **AC-5**.
- Pre registration: register `victim@` with a password, never confirm; request a sign in code for it; after the code email, the original password no longer signs in, verifies **AC-13**. Repeat through Google and record Supabase's behavior (build step 4).
- Tombstone: set `deleted_at`, sign in; signed out with the message, verifies **AC-6**.
- Reset privacy: unknown email gets the same message and no email, verifies **AC-7**.
- Agent reset: an agent with a factor resets their password; `/mfa` comes before the new password step, verifies **AC-7**.
- Agent gate order: signed out, visitor, agent without factor, agent with a 13 hour old code, agent with a fresh code each hit `/dashboard/leads`; they get sign in, 404, setup, `/mfa`, the page, verifies **AC-8**.
- Revoked session: an agent with a fresh code runs Sign out everywhere in another browser; the first browser's next agent request is refused, verifies **AC-8**.
- Every dashboard page guarded: the test that scans `app/dashboard/**/page.tsx` for `requireAgent` passes, verifies **AC-8**.
- Agent action without fresh MFA returns `mfa_required` and changes nothing, verifies **AC-8**.
- Enrollment window: an agent signed in 20 minutes ago tries to enroll; asked to sign in again, verifies **AC-9**.
- Last factor and stale removal: an agent can't remove the only factor; a stale session can't remove any factor, verifies **AC-9**.
- Phone: `01712345678` with BD saves `+8801712345678`; `12` is rejected; a UK number with GB saves in E.164, verifies **AC-10**.
- Password change: request reauth, enter the emailed code with the new password; a wrong code fails, verifies **AC-10**.
- Open redirect: `//evil.example`, `https://evil.example`, `/\evil.example`, `/%2f%2fevil.example`, `/\tevil.example` all land on the default, verifies **AC-11**.
- Hook signature: a wrong signature gets `401` and no email, verifies **AC-13**.
- Hook failure: make Resend fail; the user sees `email_send_failed`, verifies **AC-13**.
- Scripts: promote a visitor, their next request reaches MFA setup; `mfa:reset` removes factors and their sessions stop working; production asks for the email twice, verifies **AC-14**.
- Sign out scopes: sign out on one device leaves the other signed in; Sign out everywhere ends both, verifies **AC-15**.

## Build plan

Tracer Bullet: first one thin real thread (email code in, profile created, landing, sign out) through every layer, then the other methods, then agents, then the account page. Agent gating lands before features 6 and 9 need it.

1. Thin thread: `lib/server/auth.ts` (`getCurrentUser`, `requireUser`, `safeNext`, `defaultLanding`, `ensureProfile`, `completeSignIn`), the `proxy.ts` matcher and redirects, `/sign-in` with the email code method only, `/auth/confirm` with its Continue button, `verifyEmailCode`, `confirmEmailLink`, `signOut`, the Send Email Hook with the sign in code template and the pre registration password replacement, and minimal Sentry, against the local Supabase stack (its inbox) and Resend on staging, satisfies **AC-1**, **AC-2**, **AC-6**, **AC-11**, **AC-12**, **AC-13**, **AC-15**
2. hCaptcha on the code request and code entry, plus the Supabase captcha and rate limit settings and `docs/runbooks/auth-config.md`, satisfies **AC-2**, **AC-4**
3. Password: sign up with confirmation, `resendSignupCode`, sign in, forgot password, `/sign-in/new-password`, the confirm and recovery templates, satisfies **AC-3**, **AC-4**, **AC-7**, **AC-13**
4. Google: `startGoogle`, `/auth/callback`, cancel handling, the automatic linking check and the pre registration check through Google, profile name and avatar, satisfies **AC-5**, **AC-6**
5. Agents: `requireAgent`, `requireAgentAction`, `requireFreshMfa`, `requireRole` delegation, `/mfa`, `/account/security` (enroll with the 15 minute window, verify, remove, stale cleanup, backup prompt), the `/dashboard` gate with a placeholder leads page and the page scan test, the MFA step before agent password reset, and the three scripts, satisfies **AC-7**, **AC-8**, **AC-9**, **AC-14**
6. Account page: name and phone, set or change password with reauthentication and its template, linked methods (link Google, unlink), Sign out everywhere, satisfies **AC-10**, **AC-13**, **AC-15**

## Consequences

**Positive**:
- Sign in works for people reading email in phone mail apps, and mail scanners can't burn links.
- Agent accounts need a fresh phone factor twice a day, confirmed with Supabase on every request, so a stolen password, inbox, or old session alone can't open the lead list.
- One template system (React Email over Resend) for auth and booking emails, in the codebase and reviewable.
- No new tables.

**Negative / tradeoffs**:
- hCaptcha covers every email and password request, so an hCaptcha outage blocks those sign ins (Google still works), and some users on VPNs will see puzzles.
- The Send Email Hook is on the critical path: if it is down or over 5 seconds, no one can get a code or reset a password. Sentry alerts on its failures are required.
- The hook holds the service role key at request time for the password replacement; a bug there could change any user's password. Keep that code tiny and tested.
- Agent requests make an extra Supabase round trip (`getUser`) each time.
- No app audit table: answering "who changed this agent's access, and when" means joining Supabase's auth log (retention depends on plan) with Sentry events, both of which expire. This is weaker than the usual standard for access control changes.
- Manual identity linking is a beta Supabase feature.
- Agents type an authenticator code at least twice a working day, and must enroll within 15 minutes of signing in.

**Neutral**:
- Spec 0001 changes: auth emails use the Send Email Hook instead of Resend as Supabase SMTP; email sign in is a code plus link; `requireRole("AGENT")` delegates to `requireAgent`; Sentry's minimal setup arrives with this feature instead of feature 18.
- Local development uses the Supabase CLI inbox, hCaptcha test keys, and `[auth.hook.send_email]` in `supabase/config.toml` pointed at the local app.

## Follow-up

- [ ] Update spec 0001: Send Email Hook instead of SMTP, email code plus link, `requireRole("AGENT")` delegation, Sentry minimal setup moved to this feature.
- [ ] Update spec 0002's note that `getCurrentUser()` creates profiles: creation moves to `ensureProfile` in `completeSignIn`; `getCurrentUser()` stays read only.
- [ ] Verify while building, and record the result here: an MFA user's recovery session can set a new password only after the `/mfa` step; the Prisma direct connection may delete from `auth.sessions`; Supabase's behavior when Google signs in to an email whose password account was never confirmed.
- [ ] Before launch on Pro: turn on leaked password protection; confirm the Resend plan covers 100 auth emails per hour.
- [ ] Revisit an app audit table for access control events when there are more than a handful of agents, or if a client or regulator asks for it.
- [ ] Bangla auth emails and sign in page when Bangla across the site is designed (deferred in the scope).
- [ ] `/audit` should record in `AGENTS.md`: the `requireAgent` rule for every agent page and action, and the newly installed `receiving-webhooks` skill (webhook and notifications area).
- [ ] Agent skills for hCaptcha and libphonenumber-js: none credible found.
