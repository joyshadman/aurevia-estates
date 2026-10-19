# Runbook: Supabase Auth settings (spec 0004)

Set these in the Supabase dashboard for each project (staging, then production). They are what the sign in code expects. Steps marked **later** wait for keys that don't exist yet.

## Now (no new keys needed)

**Authentication → URL Configuration**
- Site URL: the environment's `NEXT_PUBLIC_SITE_URL` (for local work, `http://localhost:3000`).
- Redirect URLs: `<site>/auth/confirm**` and `<site>/auth/callback**`; on staging also `https://*-<team>.vercel.app/auth/**`.

**Authentication → Sign In / Providers → Email**
- Enable email provider: on. Confirm email: on. Secure password change: on.
- Email OTP length: 6. Email OTP expiration: 600 seconds.

**Authentication → Policies / Passwords**
- Minimum length 8. Required characters: letters and digits.

**Authentication → Multi factor**
- TOTP (app authenticator): enroll and verify on. Maximum factors per user: 10.

**Authentication → Sessions**
- JWT expiry 3600 seconds, refresh token rotation on, no time box, no inactivity timeout.

**Authentication → Emails → Templates** (interim, until the Send Email Hook sends our own emails)
Each email must show the 6 digit code and link to our `/auth/confirm` page, never to Supabase's verify URL, so mail scanners can't spend the link. `{{ .RedirectTo }}` already carries `?next=...`, which is why the rest is joined with `&`.
- Confirm signup:
  ```html
  <p>Your Aurevia code is <strong>{{ .Token }}</strong>. It expires in 10 minutes.</p>
  <p><a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">Confirm your email</a></p>
  ```
- Reset password:
  ```html
  <p>Your Aurevia reset code is <strong>{{ .Token }}</strong>.</p>
  <p><a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery">Set a new password</a></p>
  ```
- Reauthentication:
  ```html
  <p>Your Aurevia confirmation code is <strong>{{ .Token }}</strong>.</p>
  ```
- Magic link: same as Confirm signup (used once email code sign in is built).

Supabase's built in sender allows only a few emails an hour; it is fine for testing, not for launch.

## Later (needs keys)

- **hCaptcha** (Authentication → Attack Protection): enable hCaptcha with the secret; the app adds `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` and `HCAPTCHA_SECRET`. Local work can use hCaptcha's public test keys (site key `10000000-ffff-ffff-ffff-000000000001`).
- **Rate limits** (Authentication → Rate Limits): emails 100 per hour, sign ups and sign ins 30 per 5 minutes per IP, token verifications 30 per 5 minutes per IP. Raise the email limit only after Resend is in place.
- **Send Email Hook** (Authentication → Hooks): HTTPS, URL `<site>/api/hooks/send-email`; copy the generated secret into `SEND_EMAIL_HOOK_SECRET`. Turn Custom SMTP off. Needs `RESEND_API_KEY` and `AUTH_EMAIL_FROM` on a verified Resend domain.
- **Google** (Authentication → Sign In / Providers → Google): client id and secret from a Google Cloud OAuth client whose consent screen shows the Aurevia name and logo. Identity linking: automatic on, manual on.
- **Before launch on Pro**: leaked password protection on.

## Agent access

- Promote: `npm run agent:promote -- <email> --env <local|staging|production>`; demote: `npm run agent:demote -- ...`.
- Lost phone: `npm run mfa:reset -- <email> --env ...` removes every authenticator. Their old sessions still work for visitor pages; agent pages ask for setup, which needs a fresh sign in. (Ending every session from the script is still open: Supabase's `auth.sessions` isn't reachable over our Neon connection.)
