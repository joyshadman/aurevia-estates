# 0004. Visitor and agent sign in: rationale

The decision record behind [index.md](index.md). `/develop` does not need this file.

## Context

Signing in is required to chat (scope feature 7), so it sits in front of the product's one success metric: viewings booked through the assistant. Spec 0001 already fixed the provider (Supabase Auth through `@supabase/ssr`) and the methods (Google, email link, email and password), and spec 0002 fixed the profile shape, roles, and the deletion tombstone. This spec decides how the flows behave.

Forces:
- **Who signs in.** Local buyers and families abroad, mostly on phones, often reading email inside the Gmail or Outlook app, whose built in browser is not the one that started the sign in. Supabase's secure server flow (PKCE) ties a link to the browser that asked for it.
- **Abuse and cost.** Every account can run AI chats paid per token. Spec 0001 asked this feature to make throwaway accounts expensive.
- **Agent risk.** Agents can read every lead's name, phone, and chat (spec 0002 security model). An agent account is the most valuable target in the system. The tier is GA.
- **Caching.** Public pages must not read the session (spec 0001, refined by 0003).
- **Small team.** One or two people operate this; anything that needs constant admin work becomes a support burden.

## Options considered

### Option 1: Server actions, codes plus links, own email hook, app enforced agent MFA (chosen)
Supabase Auth driven from server actions; email codes and `token_hash` links; hCaptcha via Supabase; React Email templates sent by a signed Send Email Hook; agent pages require `aal2` with a code under 12 hours old.
**Pros**: works across mail apps; strong agent protection on any plan; templates in the codebase.
**Cons**: the hook is on the critical path; more pages and actions to build.

### Option 2: Magic link only, Supabase templates over Resend SMTP (spec 0001's starting point)
**Pros**: least code; no hook to run.
**Cons**: links opened in a different browser fail under PKCE; templates live in the dashboard, outside review; no place for Bangla later.

### Option 3: Supabase's hosted session controls for agents (time box or inactivity timeout)
**Pros**: no app code for session freshness.
**Cons**: the settings are project wide (they would sign out visitors too) and need the Pro plan.

### Option 4: A hosted identity provider (Clerk, Auth0) instead of Supabase Auth
**Pros**: polished prebuilt UI, built in MFA recovery codes, richer audit logs.
**Cons**: a second identity system beside Supabase; a sync job between the provider's users and `profiles`; another bill. Spec 0001 already chose Supabase Auth.

## Rationale

The code plus `token_hash` link answers the main real world failure (mail app browsers) without giving up the secure server flow, and the code is also the more usable path for anyone switching between phone and laptop. Requiring confirmed emails and a captcha addresses spec 0001's cost concern directly; Supabase's per IP limits alone would not stop a slow bot. The engineer picked hCaptcha over Turnstile; both are supported natively, and hCaptcha's main cost is more visible puzzles.

The engineer chose our own email hook over Supabase's templates. It costs one signed endpoint, but it puts every auth email in the same React Email system as the booking emails and makes the Bangla follow up a template change.

For agents, MFA is required because of what an agent session opens. I had offered a 12 hour inactivity timeout for agents only; Supabase cannot do that per role, so the spec enforces the same intent in the app: the session's `amr` claim records when the last authenticator code was entered, and `requireAgent()` asks again after 12 hours. This works on any plan and leaves visitor sessions alone. Two enrolled factors plus a script reset give a recovery path without building recovery codes, which Supabase does not provide.

The engineer chose no app audit table. That is weaker than the usual standard for access control changes, so the spec routes operator actions and gate denials to Sentry and records the gap under Consequences and Follow-up, rather than overriding the choice.

Connected methods (link and unlink) were included at the engineer's request despite Supabase's manual linking being beta; it is isolated in two actions, so a behavior change is cheap to absorb.
