# Runbook: sign in setup (Better Auth, Neon, Google)

How to set up sign in for each environment (spec 0008). Better Auth runs inside the app, so there is no auth dashboard to configure: everything here is a database, an env variable, or an outside account (Google Cloud, Resend, hCaptcha).

## Before you start

- A Neon project in Singapore (`aws-ap-southeast-1`) with branches `main` (production), `staging`, and `dev` (spec 0001).
- A Google Cloud project you can create OAuth clients in.
- A Resend account with your sending domain verified.
- An hCaptcha account (real keys for staging and production; local uses the test keys in `.env.example`).
- A fixed staging domain (for example a Vercel alias like `staging.<your domain>`). Google accepts no wildcards, so other preview deployments get email and password sign in only.

## 1. Database (each Neon branch)

1. Copy the branch's pooled URL (the `-pooler` host) into `DATABASE_URL` and the direct URL into `DIRECT_URL`.
2. Apply the migrations: `npm run db:deploy` (staging, production) or `npm run db:migrate` (dev). This creates the auth tables: `sessions`, `accounts`, `verifications`, `two_factors`, `rate_limits`.
3. Dev only: `npm run db:seed -- --sample`.
4. Check: `npm run db:status` says the database is up to date.
5. In the Neon console, give `main` a minimum compute size above zero, so the first agent request after a quiet spell doesn't wait for the database to wake.

## 2. Better Auth secret (each environment)

Generate 32 random bytes once per environment and set `BETTER_AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Set it once and keep it. Rotating it signs everyone out and breaks every stored 2FA secret, so every user with 2FA would need `mfa:reset`.

## 3. Google sign in (each environment that has a fixed domain)

1. Google Cloud console, APIs and Services, Credentials: create an OAuth client of type Web application.
2. Authorized redirect URI: `<NEXT_PUBLIC_SITE_URL>/api/auth/callback/google` (for example `http://localhost:3000/api/auth/callback/google` locally).
3. Copy the client id and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
4. Leave both empty to turn Google off; the sign in page then offers email code and password only.

## 4. Email (Resend)

- `RESEND_API_KEY`: a Resend API key (starts with `re_`).
- `AUTH_EMAIL_FROM`: a sender on your verified domain, for example `Aurevia Estates <hello@yourdomain>`. `onboarding@resend.dev` only delivers to your own Resend account address.

## 5. hCaptcha

- `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` and `HCAPTCHA_SECRET`: the site's real keys on staging and production.
- Add the environment's domain to the hCaptcha site's allowed domains.

## App environment variables (Vercel)

Set these per environment (Preview for staging, Production for production). Server only values stay out of `NEXT_PUBLIC_*`.

| Variable | Where it comes from |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | the environment's fixed origin, no trailing slash |
| `DATABASE_URL`, `DIRECT_URL` | the Neon branch (step 1) |
| `BETTER_AUTH_SECRET` | step 2 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | step 3 (optional) |
| `RESEND_API_KEY`, `AUTH_EMAIL_FROM` | step 4 |
| `NEXT_PUBLIC_HCAPTCHA_SITE_KEY`, `HCAPTCHA_SECRET` | step 5 |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | Sentry (optional) |

## Operator scripts

They read `.env.staging` or `.env.production` (git ignored), which hold that environment's `DATABASE_URL` and `SENTRY_DSN`:

- `npm run agent:promote -- <email> --env <staging|production>` makes the user an agent. Tell them to sign in and turn on 2FA within 15 minutes.
- `npm run agent:demote -- <email> --env <staging|production>` makes them a visitor again.
- `npm run mfa:reset -- <email> --env <staging|production>` turns 2FA off and ends every session, for an agent who lost their phone and their backup codes.

On production each script asks you to type the email again.

## Check it worked

- `/sign-in`: request an email code; the email arrives with the code and a link to `/auth/confirm`.
- Continue with Google returns to the page you started on.
- `curl -i -X POST <site>/api/auth/sign-in/email` answers 404 (only Google's callback is open).
- Promote a test account, sign in, and turn on 2FA at `/account/security`; `/dashboard/leads` then opens after the password and code.

## Things to remember

- There is no auth audit log. Sign in failures, agent gate denials, script runs, and email send failures go to Sentry; `sessions` rows show when and where each live session started.
- Sessions are read from the database on every request, so `mfa:reset` and Sign out everywhere take effect on the user's next request.
