# Verify: Visitor and agent sign in · spec 0004 · updated 2026-10-21
_Steps derived from spec 0004 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Before you start: fill the empty values in `.env.local` (`SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `DIRECT_URL`, `SEND_EMAIL_HOOK_SECRET`, `RESEND_API_KEY`, `AUTH_EMAIL_FROM`). A hosted Supabase project can't call the hook on `localhost`, so either run the local stack (`npx supabase start`, needs Docker) or expose the app through a tunnel and point the hook at it. See `docs/runbooks/auth-config.md`.

## UI / manual

### Email code (AC-1, AC-2, AC-6, AC-12)
- [ ] Open `/sign-in?next=/account` → see Continue with Google, the Email code and Password switch, and (under Password) Forgot password → AC-1
- [ ] Email code: enter a new email → one branded email arrives with a 6 digit code and a link → AC-2, AC-13
- [ ] Enter the code → land on `/account`; the `profiles` row exists with role VISITOR before that page renders → AC-1, AC-2, AC-6
- [ ] Open `/sign-in` while signed in → redirected straight to the landing → AC-1
- [ ] Request a code, open the email link with `curl` only (GET), then open it in another browser and press Continue → signed in; the GET did not use it up → AC-2
- [ ] Enter a wrong code, a used code, and a code older than 10 minutes → each shows "That code didn't work. Check it or send a new one." → AC-2
- [ ] Request again within 60 seconds → the button shows the countdown; forcing a request shows the rate limit message → AC-2
- [ ] Sign in as a visitor with no `next` → land on `/assistant`; as an agent → `/dashboard/leads` through the MFA check → AC-12

### Password (AC-3, AC-7)
- [ ] Create an account with `abcdefg1` → no session; the "Confirm your email" code step shows → AC-3
- [ ] Try `abcdefgh` and `1234567` → "Use at least 8 characters with a letter and a number." → AC-3
- [ ] Before confirming, sign in with that password → "Confirm your email first." with Send code; Send code shows the code step → AC-3
- [ ] Create an account with an email that already exists → the same code step (no hint the account exists) → AC-3
- [ ] Forgot password with an unknown email → "If that email has an account, we've sent a code." and no email → AC-7
- [ ] Forgot password with a real email → code or link opens "Set a new password"; a valid password signs you in → AC-7
- [ ] Agent with a verified factor resets their password → `/mfa` comes before "Set a new password" → AC-7

### Captcha (AC-4)
- [ ] Call `requestEmailCode`, `signUpWithPassword`, `signInWithPassword`, and `requestPasswordReset` with an empty or bad token → `captcha_failed`, no email sent, the widget resets → AC-4
- [ ] Call `verifyEmailCode` with a bad token → `captcha_failed` before Supabase is called → AC-4
- [ ] Google and the `/auth/confirm` Continue button work without a captcha → AC-4

### Google (AC-5, AC-6)
- [ ] Continue with Google from `/sign-in?next=/account` → signed in on `/account`; `full_name` and `avatar_url` filled from Google → AC-5, AC-6
- [ ] Cancel on Google's consent screen → back on `/sign-in` with "Google sign in was cancelled." → AC-5
- [ ] Confirmed password account, then Google with the same email → the same profile id and chats → AC-5
- [ ] Set `deleted_at` on a profile and sign in by any method → signed out with "This account has been deleted." → AC-6

### Agents and MFA (AC-8, AC-9)
- [ ] Hit `/dashboard/leads` as: signed out, visitor, agent with no factor, agent with a code over 12 hours old, agent with a fresh code → sign in, 404, `/account/security?setup=required&next=…`, `/mfa?next=…`, the page → AC-8
- [ ] Agent with a fresh code: run Sign out everywhere in another browser; the first browser's next dashboard request is refused → AC-8
- [ ] Call an agent action through `requireAgentAction()` without a fresh code → `{ ok: false, reason: "mfa_required" }`, nothing changes → AC-8
- [ ] Enroll on `/account/security`: name it, scan the QR code (or type the key), enter a code → factor listed; with `next`, you land on `next` → AC-9
- [ ] Agent signed in over 15 minutes ago with no factor tries to enroll → "For your security, sign in again to set up an authenticator." → AC-9
- [ ] Leave an enrollment unfinished, wait over an hour, reload `/account/security` → the unverified factor is gone → AC-9
- [ ] Agent with one factor → backup prompt shows; removing it → "Add another authenticator before removing this one." → AC-9
- [ ] With a code over 12 hours old: add a second factor, remove a factor, or unlink a method → `mfa_required` with an Enter code link → AC-9
- [ ] Two factors on `/mfa` → the picker defaults to the most recently verified one → AC-9

### Account page (AC-10, AC-15)
- [ ] Name: empty or 81 characters → "Enter a name up to 80 characters."; 1 to 80 saves → AC-10
- [ ] Phone: `01712345678` with Bangladesh saves `+8801712345678`; `12` is rejected; a UK number with United Kingdom saves in E.164 → AC-10
- [ ] Country list: Bangladesh first, the rest sorted by English name → AC-10
- [ ] Password: Email me a code, enter it with a new password → saved; a wrong code → "That confirmation code didn't work." → AC-10, AC-13
- [ ] Linked methods: Link Google adds it; Unlink works while another method remains; the last one shows "Only method" → AC-10
- [ ] Linking a Google account that belongs to another user → back on `/account` with "That Google account is already linked to another Aurevia account." → AC-10
- [ ] Sign out on one device → the other stays signed in; Sign out everywhere → both end, back on `/sign-in` → AC-15
- [ ] Close and reopen the browser → still signed in → AC-15

### Hook and emails (AC-13)
- [ ] Each email (sign in code, sign up confirm, reset, reauthentication) uses the brand template; all but reauthentication carry a link to `/auth/confirm` → AC-13
- [ ] Register `victim@` with a password, never confirm, request a sign in code → after the email, the original password no longer works → AC-13
- [ ] Make Resend fail (bad `RESEND_API_KEY`) → the user sees "We couldn't send the email. Try again in a minute." → AC-13

## Commands
- [ ] `curl -X POST -H 'webhook-id: x' -H 'webhook-timestamp: 1' -H 'webhook-signature: v1,abc' -d '{}' <site>/api/hooks/send-email` → `401` → AC-13 (passed on 2026-10-21 against the dev server)
- [ ] `curl -I '<site>/auth/callback?error=access_denied'` → `307` to `/sign-in?error=google_cancelled` → AC-5 (passed 2026-10-21)
- [ ] `curl -I <site>/dashboard/leads` with no cookie → `307` to `/sign-in?next=%2Fdashboard%2Fleads` → AC-8 (passed 2026-10-21)
- [ ] `npm run test:e2e` → `every dashboard page imports requireAgent` passes → AC-8 (passed 2026-10-21)
- [ ] `safeNext` with `//evil.example`, `https://evil.example`, `/\evil.example`, `/%2f%2fevil.example`, `/<tab>evil.example`, `/auth/x`, `/api/x` → all null; `/account?x=1` kept → AC-11
- [ ] `npm run agent:promote -- <email> --env staging` → role AGENT, reminder printed, Sentry event with the operator name; the user's next request reaches MFA setup → AC-14
- [ ] `npm run agent:demote -- <email> --env staging` → role VISITOR → AC-14
- [ ] `npm run mfa:reset -- <email> --env staging` → factors removed and sessions ended; the user's old session stops working → AC-14
- [ ] Any script with `--env production` → asks for the email again; a mismatch changes nothing. An unknown email is refused → AC-14

## Value sourcing
- [ ] Landing path: `next` that fails `safeNext` falls back to `defaultLanding` from `profiles.role` (change the role in the database, sign in again, landing follows)
- [ ] Cooldown: the countdown starts at 60 and matches Supabase's per email send frequency
- [ ] OTP type: a recovery code entered on the sign in code step fails; on the reset code step it works (purpose sets the type)
- [ ] Hook code, token hash, recipient: the email shows the payload's code; the link's `token_hash` matches; it goes to `user.email`
- [ ] Hook link origin and `next`: a `redirect_to` on another origin, or with `next=//evil.example`, produces a link on `NEXT_PUBLIC_SITE_URL` with no `next`
- [ ] Hook password replacement: happens only for `magiclink` with `email_confirmed_at` null (a confirmed user's password still works after requesting a code)
- [ ] Hook sender: the From header equals `AUTH_EMAIL_FROM`
- [ ] Name and avatar: Google accounts using `name` and `picture` (not `full_name`, `avatar_url`) still fill the profile
- [ ] requireAgent session: revoke the session in the Supabase dashboard; the next agent request is refused even though the JWT has not expired
- [ ] requireAgent role and deleted state: demote in the database or set `deleted_at`; the next request changes at once
- [ ] Code freshness: compare against server time, not the browser clock (skew the browser clock; the result does not change)
- [ ] Enrollment window: measured from the newest `amr` entry; signing in again restarts it
- [ ] `/mfa` default factor: verify factor A, then B, then use A on `/mfa`; next time A is the default
- [ ] Stale factors: only `unverified` ones over one hour old are removed, never verified ones
- [ ] E.164 phone and country names: the stored value always starts with `+`; names come from `Intl.DisplayNames` in English
- [ ] Linked methods list: matches `auth.identities` for the user
- [ ] Scripts target: `--env staging` prints the staging project ref; the user is matched by lowercased email

## Acceptance-criteria coverage
- AC-1: Email code steps 1, 4 · AC-2: Email code steps 2 to 7 · AC-3: Password steps 1 to 4 · AC-4: Captcha steps · AC-5: Google steps 1 to 3, callback command · AC-6: Email code step 3, Google steps 1 and 4 · AC-7: Password steps 5 to 7 · AC-8: Agents steps 1 to 3, dashboard commands · AC-9: Agents steps 4 to 9 · AC-10: Account steps 1 to 6 · AC-11: `safeNext` command · AC-12: Email code step 8 · AC-13: Hook steps, hook command, Account step 4 · AC-14: script commands · AC-15: Account steps 7 and 8

## Not built yet
- The hook accepts only `NEXT_PUBLIC_SITE_URL` as the link origin. Spec 0004 *Redirect URLs* also allows staging preview origins (`https://*-<team>.vercel.app`), but nothing names where the team value comes from; on previews, links currently go to that environment's site URL.
