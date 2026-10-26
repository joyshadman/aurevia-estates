# 0017 · Privacy, terms & cookie consent

**Status**: Assumed
**Date**: 2026-10-26
**Authorized by**: joyshadman, during /develop ("finish slice 3 with recommended decisions")

## Owed decision
What the privacy and terms pages say, how cookie consent works (what counts as essential, where the choice is stored, how it is changed), and how a user deletes their account and chats.

## Assumption built on
- **Pages**: `/privacy` and `/terms` are static, cached server pages (no cookies, no auth), linked from the footer. The text is a plain starting draft written from what the code actually stores and sends (spec 0002, 0006, 0007, 0008), with a "last updated" date. It is **not legal advice**: a lawyer reviews it before launch (a launch blocker, like Vercel Pro in spec 0001).
- **What is essential** (always on, no consent asked): the Better Auth session cookies, the theme preference, the consent cookie itself, and Sentry error reports (no cookies, no user info, no replay, no tracing; spec 0004 config). **Non essential**: PostHog analytics (spec 0001: "started only after cookie consent"). Nothing else tracks.
- **Consent store**: a first party cookie `aurevia_consent` with value `analytics` or `essential`, `Path=/`, `SameSite=Lax`, `Secure` on https, 180 days. Written and read **only in the browser**, so public pages stay cacheable (root `AGENTS.md`: public pages never read cookies). No cookie means "not chosen yet": the banner shows and nothing non essential loads.
- **Banner**: a small fixed card at the bottom with two equal buttons, "Allow analytics" and "Essential only", and a link to `/privacy`. No pre ticked boxes, no dark patterns. The footer has "Cookie settings", which opens the same card again. Changing to `essential` stops PostHog at once and clears its storage (spec 0018).
- **Account deletion**: self serve on `/account`, a "Delete account" panel. Visitors only; an agent sees "Ask the agency owner to remove your agent account" (agent accounts own listings, spec 0005). To delete, the user types their email address, and the session must have started within the last 15 minutes (else `session_not_fresh`, reusing the sign in again flow); with 2FA on it also needs a recent authenticator code (`mfa_required`). One transaction, the spec 0002 AC-10 shape plus the spec 0007 additions:
  - cancel every active viewing (reason `Visitor deleted their account`, through `transitionViewingIn`). Lead statuses are left alone: the agent closes them; leads are only scrubbed.
  - delete the visitor's conversations (messages, briefs, recommendations go by cascade), saved homes, AI usage rows, and pending outbox emails to them (spec 0019).
  - leads: `visitor_id` null, `contact_name` `Deleted user`, `contact_phone`, `contact_whatsapp`, `message` null, and `contact_email` the tombstone address `deleted+<id>@deleted.invalid`. Spec 0002 says null both phone and email, but its own `leads_contact_ck` needs one of them; the tombstone address names no one and needs no migration. `/architect` should reconcile spec 0002.
  - viewings on those leads: a set `cancel_reason` becomes `Removed on account deletion` (spec 0002's constant), except the fixed reasons we write ourselves, which name no one.
  - lead activities written by the visitor: `body` null.
  - profile tombstone: `deleted_at` now, `full_name` '', `email` `deleted+<id>@deleted.invalid` (keeps the unique index and frees the real address), `phone`, `avatar_url` null, `email_verified` false, agent fields cleared, `agent_is_public` false.
  - Better Auth rows: sessions, accounts, two factor row deleted, so no way back in.
  - Then the browser is sent to `/?deleted=1`. Single chats are already deletable one by one (spec 0006).

## Code area
`app/privacy/`, `app/terms/`, `lib/legal.ts`, `components/chrome/consent-banner.tsx`, `lib/consent.ts`, `components/chrome/site-footer.tsx`, `lib/nav.ts`, `app/layout.tsx`, `lib/server/account-deletion.ts`, `app/account/actions.ts`, `app/account/account-forms.tsx`, `app/account/page.tsx`, `lib/auth/messages.ts`

## Requirements
- **AC-1**: `/privacy` and `/terms` render for anyone, are prerendered (no cookie or session read), and are linked from the footer.
- **AC-2**: On a first visit the consent card shows; PostHog does not load and no PostHog request leaves the browser until "Allow analytics" is clicked.
- **AC-3**: The choice survives reloads (180 days); "Cookie settings" in the footer reopens the card, and switching to "Essential only" stops analytics at once.
- **AC-4**: A visitor deletes their account from `/account` by typing their email; afterwards they are signed out everywhere, their chats, saved homes, and AI usage are gone, and signing in with the old email starts a fresh empty account.
- **AC-5**: After deletion the agent still sees the lead and its viewing history, with the contact scrubbed (`Deleted user`, no phone, real email, WhatsApp flag, or message), active viewings cancelled, and the visitor's notes and cancel reasons gone.
- **AC-6**: Deletion refuses a stale session (`session_not_fresh`), a wrong typed email, and agents.

## Ratify
This decision was recorded by /develop, not deliberated. Run `/architect privacy, terms & cookie consent` to deliberate and ratify it (and have the page text reviewed by a lawyer). Until then it stays flagged as an owed decision; it does not block marking the feature `done`.
