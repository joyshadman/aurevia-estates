# Verify: visitor and agent sign in · spec 0004 · updated 2026-10-19
_Steps derived from spec 0004 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

First apply the "Now" settings in `docs/runbooks/auth-config.md` to the Supabase project, and point `.env.local` at a reachable database with every migration applied. Steps for email codes, hCaptcha, Google, the Send Email Hook, and Sentry wait for their keys.

## Commands
- [ ] `npm run test:db` → `tests/db/auth-rules.test.ts`, `tests/db/sign-in.test.ts`, `tests/db/dashboard-gate.test.ts`, and the `getCurrentUser` tests in `tests/db/deletion.test.ts` pass → AC-6, AC-8, AC-11, AC-12
- [ ] `npm run build` with `NEXT_PUBLIC_SITE_URL` set → every auth page builds; without it in production, start fails loudly → AC-11
- [ ] `npm run agent:promote -- <email> --env local` → "is now AGENT"; an unknown email is refused; with `--env production` it asks for the email again → AC-14
- [ ] `npm run mfa:reset -- <email> --env local` → factors removed; the agent's next dashboard visit asks for setup → AC-14

## UI / manual
- [ ] Signed out, open `/account`, `/dashboard/leads`, `/assistant?q=hi`, `/mfa` → each goes to `/sign-in?next=<that path>` → AC-8
- [ ] Create an account with `abcdefgh` → weak password message; with a valid password → the code step; the email has a code and a `/auth/confirm` link → AC-3
- [ ] Before confirming, sign in with the password → "Confirm your email first" with Send code → AC-3
- [ ] Enter the code → signed in, landed on `next` (or `/assistant`); the profile exists on that first page → AC-1, AC-6, AC-12
- [ ] Open the email link in another browser → "Continue signing in"; loading the page alone does not use the link; Continue signs in → AC-2
- [ ] A used or made up link → "That link has expired or was already used." → AC-2
- [ ] Forgot password with an unknown email and a known one → the same message; the code leads to "Set a new password" → AC-7
- [ ] Signed in, open `/sign-in?next=/account` → straight to `/account` → AC-1
- [ ] `next` values `//evil.example`, `https://evil.example`, `/%2f%2fevil.example` → land on the default instead → AC-11
- [ ] Promote a test user. Visiting `/dashboard/leads`: no authenticator → `/account/security?setup=required`; set one up (QR and manual key) within 15 minutes of signing in → back to the page → AC-8, AC-9
- [ ] Sign in again 20 minutes later without a factor → enrolling asks you to sign in again → AC-9
- [ ] With a factor, a new session → `/mfa` before any agent page; the code passes you through → AC-8
- [ ] As a visitor, `/dashboard/leads` → 404 page → AC-8
- [ ] Remove your only authenticator as an agent → refused; add a backup first → the backup prompt disappears → AC-9
- [ ] An agent with an authenticator resets their password → `/mfa` comes before "Set a new password" → AC-7
- [ ] Account page: save name and `01712345678` with Bangladesh → stored as `+8801712345678`; `12` → invalid phone; tick WhatsApp → saved → AC-10
- [ ] Change password: Email me a code, enter it with a new password → saved; a wrong code → "That confirmation code didn't work." → AC-10
- [ ] Sign out on one browser leaves another signed in; Sign out everywhere ends both → AC-15

## Not built yet (waiting for keys)
- Email code sign in and the Send Email Hook with branded emails (AC-2, AC-13)
- hCaptcha on every public form and on code entry (AC-4)
- Google sign in and linking (AC-5, the link part of AC-10)
- Sentry reports from the scripts and hook (AC-14)
- Ending every session from `mfa:reset` (needs a way to reach Supabase's `auth.sessions`)
