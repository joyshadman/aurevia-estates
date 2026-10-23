# Routes, pages, and actions (`app`)

## Overview

The App Router tree: public pages, the sign in flow (`(auth)`), the visitor account, the agent dashboard, and the few route handlers. Pages and server actions stay thin. They check the user through `lib/server/auth.ts`, validate with Zod, and leave the work to a `lib/server` service.

## Key files

| File | Owns |
|---|---|
| `(auth)/actions.ts` | every sign in action (email code, password, reset, the 2FA step, Google); each public one checks hCaptcha and our rate limiter, then calls `auth.api.*` |
| `(auth)/auth/confirm/page.tsx` | the interstitial every email link lands on (a code is never used up on GET) |
| `(auth)/auth/continue/page.tsx` | Google's return page: confirms the session, then lands on `next` |
| `api/auth/[...all]/route.ts` | Better Auth over HTTP; every path is closed except Google's callback, `/error`, `/ok` |
| `account/actions.ts`, `account/security/` | profile, password, linked methods, and 2FA (Better Auth) |
| `dashboard/layout.tsx` | the agent portal shell, static (reads no session) |
| `dashboard/listings/actions.ts` | listing actions; refresh public cache tags after commit |
| `dashboard/listings/messages.ts`, `status.ts` | the words each failure reason and status shows |
| `styleguide/` | the component showcase the e2e tests boot against |

## Conventions

- A server action returns `{ ok: true, ... }` or `{ ok: false, reason }`, never a thrown error the user sees. The words for each `reason` live in a sibling `messages.ts` that the action and the client form share.
- Agent actions call `requireAgentAction()` first; agent pages call `requireAgent({ next })`. Visitor pages call `requireUser({ next })`.
- Every `page.tsx` under `dashboard/` calls `requireAgent()` itself, because layouts don't rerun on client navigation. `tests/e2e/agent-gate.spec.ts` fails the build when one doesn't.
- After a write that changes what the public sees, call `updateTag("listing:<id>")` and `updateTag("listings")`, only once the transaction has committed.
- Route handlers exist only for webhooks, streaming chat, cron, upload signing, and the Better Auth route. Everything else is a server action.
- Auth goes through our server actions calling `auth.api.*` with `await headers()`, never through Better Auth's browser client: its HTTP endpoints are closed (spec 0008, AC-4).
- The raw color lint rule covers `app/` and `components/`; only `styleguide/` is exempt.

## Gotchas

- A server action that calls `auth.api.*` can't read the cookie it just set from this request's headers, so pass the returned user to `completeSignIn` instead of reading the session again.
- A form that redirects back to its own page (for example the password step going to `?step=2fa`) needs a `key` per step, or React keeps the old step's state.
- `emails/` sits outside the lint rule on purpose: email clients can't read CSS variables, so templates write the `design.md` brand values out as hex.
- Any `next` redirect value passes through `safeNext` first.

## Agent skills

- [resend](../.claude/skills/resend/): `resend/resend-skills`, sending auth emails through Resend
- [react-email](../.claude/skills/react-email/): `resend/react-email`, the templates in `emails/`
- [receiving-webhooks](../.claude/skills/receiving-webhooks/): `standard-webhooks/standard-webhooks`, any future webhook receiver (none today)
- [better-auth-best-practices](../.claude/skills/better-auth-best-practices/): `better-auth/skills`, the `auth.api.*` calls in the sign in and account actions
- [vercel-react-best-practices](../.claude/skills/vercel-react-best-practices/): `vercel-labs/agent-skills`, page and component performance

## Related specs

- [0008 sign in](../docs/specs/0008-better-auth-sign-in/index.md) · [0005 listing management](../docs/specs/0005-agent-listing-management/index.md) · [auth settings runbook](../docs/runbooks/auth-config.md)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
