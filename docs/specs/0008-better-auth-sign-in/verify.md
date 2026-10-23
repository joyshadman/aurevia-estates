# Verify: Visitor and agent sign in · spec 0008 · updated 2026-10-22
_Steps derived from spec 0008 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones. Covers build tasks 1 to 4 (email code, abuse controls, password, Google). Tasks 5 to 7 add their own steps._

## Before you start
- [ ] The Neon project exists in `aws-ap-southeast-1` with `main`, `staging`, `dev`; `.env.local` points `DATABASE_URL` (pooled, `-pooler` host) and `DIRECT_URL` (direct host) at `dev` → migration plan phase 1
- [ ] `.env.local` has `BETTER_AUTH_SECRET` (32+ random bytes), `RESEND_API_KEY` (a real Resend key), `AUTH_EMAIL_FROM`, and for Google `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- [ ] `npm run db:deploy` then `npm run db:seed -- --sample` succeed

## Commands
- [ ] `npm run db:status` → no pending migrations; `20261022120000_better_auth` applied → data model
- [ ] `psql "$DIRECT_URL" -c "\d profiles"` → `email` not null with `profiles_email_key`, `email_verified` and `two_factor_enabled` default false, `full_name` not null default '' → data model
- [ ] `psql "$DIRECT_URL" -c "\dt"` → `sessions`, `accounts`, `verifications`, `two_factors`, `rate_limits` exist → data model
- [ ] `npm run typecheck && npm run lint && npm run build` → all pass → every AC
- [ ] `curl -s -o /dev/null -w "%{http_code}" -X POST localhost:3000/api/auth/email-otp/send-verification-otp` → 404; same for `/api/auth/sign-in/email` and `/api/auth/two-factor/disable` → AC-4
- [ ] `curl -s localhost:3000/api/auth/ok` → 200 `{"ok":true}` (the open status path) → AC-4
- [ ] `curl -sI "localhost:3000/auth/confirm?type=sign-in&email=a@b.co&code=123456"` → `Referrer-Policy: no-referrer` and `Cache-Control: no-store` → AC-2

## UI / manual
- [ ] Visit `/sign-in?next=/assistant` → Google, Email code, Password tabs, and Forgot password show → AC-1
- [ ] Email code: enter a new address → one email arrives with a 6 digit code and a button to `/auth/confirm?type=sign-in&email=…&code=…&next=%2Fassistant` → AC-2, AC-13
- [ ] Type the code → land on `/assistant`; `profiles` has the row with role `VISITOR`, `email_verified = true`, lowercased email; `sessions` has one row → AC-1, AC-2, AC-6
- [ ] Link prefetch: `curl` the `/auth/confirm` link, then open it in another browser and press Continue → signed in (GET did not use the code) → AC-2
- [ ] After load, the address bar shows `/auth/confirm` with no query → AC-2
- [ ] Wrong code three times, then the right one → `otp_invalid` every time (the code is dead after 3 wrong tries) → AC-2
- [ ] Ask for a code, then again within 60 seconds → the button counts down; a forced second request returns `rate_limited`, and the first emailed code **still works** → AC-2
- [ ] `select value from verifications` → no plain 6 digit code stored → AC-2
- [ ] Captcha: submit any email, password, or code action with hCaptcha blocked (devtools request blocking on `hcaptcha.com`) → `captcha_failed`, no email sent → AC-4
- [ ] Rate limits: 31 password sign ins from one IP in 5 minutes → the 31st is `rate_limited`; 11 for one email → the 11th is `rate_limited` (check `rate_limits` rows `ip:signInWithPassword:local` and `email:signInWithPassword:<email>`) → AC-4
- [ ] Password sign up with `abcdefgh` → `weak_password`; with `abcdefg1` → the code step shows and no session row exists → AC-3
- [ ] Before confirming, sign in with that password → `email_not_confirmed` with Send code → AC-3
- [ ] Confirm by code (or the link's Continue) → signed in and landed on `next` → AC-3
- [ ] Sign up again with an existing verified email → same "check your email" step, in about the same time, no email sent → AC-3
- [ ] Pre registration: sign up `victim@` with password A, don't confirm; (a) request a sign in code and use it, or (b) sign up again with password B and confirm → password A no longer signs in → AC-13
- [ ] Forgot password for an existing and an unknown email → the same message; time both (within 50 ms of each other, both near 800 ms) → AC-7
- [ ] Reset by typed code on `/sign-in` → "Set a new password" step → save → signed in; other browsers' sessions for that user are gone from `sessions` → AC-7
- [ ] Reset by link → `/auth/confirm?type=reset…` shows the new password field → save → signed in → AC-7
- [ ] Reset with a wrong code → back to the code step with `otp_invalid` → AC-7
- [ ] Google: Continue with Google → returns through `/auth/continue?next=…` to `next`; a new profile has Google's name and photo → AC-5, AC-6
- [ ] Cancel at Google → `/sign-in` shows `google_cancelled`; nothing else changes → AC-5
- [ ] Google with the same email as an existing verified account → the same profile id, same chats → AC-5
- [ ] Google on an unverified password account → that password stops working; `email_verified` becomes true → AC-5, AC-13
- [ ] Tombstone: set `deleted_at` on a profile; sign in by code, password, and Google → `account_deleted`, no new `sessions` row → AC-6
- [ ] Already signed in visitor opens `/sign-in?next=/assistant` → redirected to `/assistant` at once → AC-1
- [ ] Sign out → back on `/`; only this device's `sessions` row is gone → AC-15
- [ ] Open redirect: `/sign-in?next=//evil.com`, `?next=/%2F%2Fevil.com`, `?next=/auth/confirm`, `?next=https://evil.com` → each ignored; landing is the default → AC-11, AC-12
- [ ] Email send failure: set `RESEND_API_KEY` to an invalid key, request a sign in code → `email_send_failed` shown, Sentry has `auth.email_send_failed` → AC-13
- [ ] Sentry scrub: force an error on `/auth/confirm?...` → the Sentry event URL has no query → AC-2

## Value sourcing
- [ ] Landing path: sign in with no `next` as a VISITOR → `/assistant`; as an AGENT → `/dashboard/leads` (then the agent gate) → `safeNext(next)` else `defaultLanding(profiles.role)`
- [ ] Cooldown: `rate_limits` row `cooldown:sign-in:<email>` has `last_request` = send time in epoch ms; a request at 59 s is refused, at 61 s accepted → `rate_limits.last_request`, 60 seconds
- [ ] Rate limit counts: rows `ip:<action>:<ip>` and `email:<action>:<email>`; on Vercel the IP comes from `x-vercel-forwarded-for` (send a fake `x-forwarded-for` and confirm it is ignored) → client IP source
- [ ] Code validity: `verifications` row for `sign-in-otp-<email>` holds a hash and an attempt counter; it expires at 600 s → Better Auth's `verifications` row
- [ ] Email link `next`: request a code from `/sign-in?next=/assistant` → the link carries `next=%2Fassistant`; from `/sign-in?next=//evil.com` → no `next` → the `AsyncLocalStorage` store through `safeNext`
- [ ] Await or background: with Resend failing, a sign in code shows `email_send_failed`, while sign up and reset still answer ok and only Sentry hears of it → `type`
- [ ] Password replacement: only when `profiles.email_verified` is false and the type is `sign-in` (a verified user's password survives a code sign in) → `profiles.email_verified`
- [ ] Sender: the email's From is `AUTH_EMAIL_FROM` → `AUTH_EMAIL_FROM`
- [ ] Google name and avatar: `full_name` and `avatar_url` match the Google profile → Google `name`, `picture`

## Acceptance-criteria coverage
- AC-1: sign in page, already signed in redirect · AC-2: code, link, prefetch, attempts, cooldown, hashing, headers · AC-3: password sign up and confirm · AC-4: captcha, closed endpoints, rate limits · AC-5: Google, cancel, linking · AC-6: profile row, tombstone · AC-7: reset by code and link, equal time · AC-11: open redirect cases · AC-12: default landing · AC-13: templates, send failure, pre registration · AC-15: sign out this device
- Not yet covered (tasks 5 to 7): AC-8, AC-9, AC-10, AC-14, the AC-15 agent 12 hour rule, AC-16

---

# Tasks 5 to 7 (agents and 2FA, account page, Supabase removal) · added 2026-10-22

## Commands
- [ ] `npm run typecheck && npm run lint && npm run build` → all pass; the route list has no `/api/hooks/send-email` and no `/auth/callback` → AC-16
- [ ] `grep -ril supabase app lib components scripts proxy.ts package.json .env.example` → nothing (after `/sync` updates `app/AGENTS.md` and `lib/server/AGENTS.md`) → AC-16
- [ ] `npm ls @supabase/ssr @supabase/supabase-js standardwebhooks` → empty → AC-16
- [ ] `npm run agent:promote -- <email> --env staging` → prints the Neon host and "Ask the agent to sign in and turn on 2FA now"; `profiles.role` is `AGENT`; Sentry has `operator.agent_promote` with your machine user name → AC-14
- [ ] `npm run mfa:reset -- <email> --env staging` → the user's `two_factors` row and every `sessions` row are gone, `two_factor_enabled = false`; their open browser is signed out on the next request → AC-8, AC-14
- [ ] Any script with an unknown email → "No account with the email …", nothing changes; with `--env production` → asks for the email again → AC-14

## UI / manual: agents and 2FA
- [ ] Agent gate order on `/dashboard/leads`: signed out → `/sign-in?next=%2Fdashboard%2Fleads`; visitor → 404; agent without 2FA → `/account/security?setup=required&next=…`; agent signed in by email code (2FA on) → `/sign-in?next=…&error=agent_reauth` on the password method, with no bounce back to the dashboard → AC-8
- [ ] Turn on 2FA (agent, within 15 minutes of signing in): password → QR code and key → first code → 10 backup codes with Copy and Download → "I've saved them" lands on `next` (`/dashboard/leads`) → AC-9
- [ ] The new session row has `two_factor_verified_at` set and `expires_at` 12 hours after `created_at`; the old session row is gone (2FA on replaces the session) → AC-8, AC-15
- [ ] Agent signed in more than 15 minutes ago opens `/account/security` → "sign in again" instead of the password form → AC-9
- [ ] Password sign in with 2FA on → `/sign-in?step=2fa&next=…`; reload → still the code step; no `sessions` row exists until the code → AC-8
- [ ] Right authenticator code → lands on `next`; the session has `two_factor_verified_at` → AC-8
- [ ] Backup code: sign in with one → works once; the same code again → `otp_invalid`; `/account/security` shows 9 of 10 left → AC-9
- [ ] 5 wrong codes at the step → the fifth answers `too_many_attempts`, the form is back on the password method with no `step` in the address bar; Sentry has `auth.two_factor_locked`; `rate_limits` has a `2fa:<hash>` row with count 5 → AC-9
- [ ] Wait 10 minutes at the code step, then enter a code → `two_factor_expired`, back to the password → AC-8
- [ ] Agent tries Turn off on `/account/security` → only the "Agents must keep two step verification on" note shows; the action (forced) answers `agent_needs_2fa` → AC-9
- [ ] Visitor with 2FA and a session older than 12 hours since the code (set `two_factor_verified_at` back 13 hours) → Get new codes and Turn off ask to sign in again (`mfa_required`) → AC-9
- [ ] Regenerate backup codes with the password → 10 new codes shown once; an old code no longer works → AC-9
- [ ] Agent with `two_factor_verified_at` 13 hours old → the dashboard sends them to the password step; an agent server action (for example saving a listing) returns `mfa_required` and their session row is deleted → AC-8
- [ ] Sign out everywhere in browser B → browser A's next dashboard request goes to sign in → AC-8, AC-15

## UI / manual: account page
- [ ] `/account`: name `""` → `invalid_name`; 81 characters → `invalid_name`; phone `01712345678` with Bangladesh → saved as `+8801712345678` → AC-10
- [ ] Change password with a wrong current password → "Your current password is wrong."; with the right one → saved; the user's other `sessions` rows are gone, this browser stays signed in → AC-10
- [ ] Google only user: Password panel offers "Email me a code" → the "Set your Aurevia password" email arrives → code plus password → saved, still signed in on this device, other sessions gone; an `accounts` row with `provider_id = credential` exists → AC-10, AC-13
- [ ] Sign in methods lists Email code, Email and password, Google; Link Google round trips through Google back to `/account`; a Google account already linked elsewhere → `/account?error=linking_failed` message → AC-10
- [ ] Unlink while two methods remain → removed; with one left there is no Unlink button; signed in more than 15 minutes ago → `session_not_fresh` with "Sign in again" → AC-10
- [ ] A visitor's session: `expires_at` 30 days out; take an action more than a day later (set `updated_at` back) → `expires_at` moves forward; a page view alone doesn't move it → AC-15
- [ ] An agent's session: `expires_at` stays 12 hours after creation after the same forced refresh → AC-15

## Value sourcing (tasks 5 and 6)
- [ ] `/sign-in` step: delete the `better-auth.two_factor` cookie and reload `?step=2fa` → `two_factor_expired` on the password method (the cookie, not the query, picks the step) → Better Auth's 2FA cookie
- [ ] Wrong attempts: `rate_limits` key is `2fa:` plus the sha256 of the cookie value; a new password sign in starts a new count → `2fa:<sha256 of the 2FA cookie>`
- [ ] Code freshness: `requireAgent` and `requireFreshTwoFactor` compare `sessions.two_factor_verified_at` with server time; vary it across 11 h 59 m and 12 h 01 m → fresh, then not → 12 hours
- [ ] Enrollment window: an agent session with `created_at` 14 minutes ago can turn 2FA on; 16 minutes ago cannot → `sessions.created_at`, 15 minutes
- [ ] Backup codes left: matches the count Better Auth decrypts from `two_factors.backup_codes` after each use → `two_factors.backup_codes`
- [ ] Linked methods: the list matches `accounts` rows for the user → `listUserAccounts`
- [ ] Scripts target: `--env staging` prints the staging Neon host from `.env.staging` → `--env` flag

## Acceptance-criteria coverage (tasks 5 to 7)
- AC-8: gate order, reload at the code step, 12 hour freshness, revoked sessions · AC-9: enable, backup codes, 5 wrong codes, 15 minute window, agents can't turn off · AC-10: name, phone, password change, first password, linking, sign out everywhere · AC-14: the three scripts · AC-15: agent 12 hours, visitor extension · AC-16: no Supabase package, env, client, or URL
