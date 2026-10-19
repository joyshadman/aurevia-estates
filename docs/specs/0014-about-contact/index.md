# 0014 · About and contact

**Status**: Assumed
**Date**: 2026-10-19
**Authorized by**: Joy Shadmane, during /develop

## Owed decision
What the About page says when the mockup (`desing-check/aurevia-estates/about.html`) is marked "sample data only", where the advisor list comes from, what the contact form asks, how a submission becomes a lead, and how a public form resists spam before an hCaptcha key exists. Spec 0002 already defines `leads` with `source = CONTACT_FORM`, and spec 0008 shows unassigned contact form leads to every agent.

## Assumption built on
- **Real data only** (chosen by Joy): no invented history, people, testimonials, statistics, or contact details. The story, mission, and values live in `lib/content/about.ts`, written only from what the product does (hand checked homes in Sylhet, the bilingual assistant). Office address, hours, phone, email, and WhatsApp are `null` there until the agency supplies them; each renders only when set.
- **Advisors**: public agent cards from the database (role AGENT, `agent_is_public`, not deleted, with a name): photo, name, and title, by name. Cached under the `listings` tag, which the agent profile save already updates. The section hides when there are none.
- **Page**: `/about`, public and cacheable; it never reads the session. Sections from the mockup, in order: hero, story, mission and values, advisors, contact (`#contact`). The header's "About & contact" link and the "Sell" link (`/about?intent=sell#contact`) go live.
- **Form**: name (required, up to 80), email and phone (at least one; phone with country, stored as E.164), "I'd like to" (Buy a home, Sell my property, Get a valuation, Something else; preselected from `?intent=`), property type (optional, from the listing types), message (required, up to 1000), "Reply on WhatsApp" (only with a phone). Validated with Zod on the server; field errors return to the form; success replaces the form with a thank you naming the person.
- **Lead**: one `leads` row per submission, `source = CONTACT_FORM`, `status = NEW`, no listing, no assigned agent (every agent sees it, spec 0008), `visitor_id` set when signed in (read inside the action, never the page). `message` holds the intent and type on its first line, then the message. One SYSTEM activity "Lead created from the contact form". No email or notification yet (feature 19).
- **Spam** (chosen by Joy: wait for hCaptcha): the form needs `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` and `HCAPTCHA_SECRET`. Until both are set the page shows the office details and an "Ask the Aurevia Assistant" link in place of the form, and the action refuses. With them, the widget's token is verified server side (`api.hcaptcha.com/siteverify`, 5 s timeout) before any write; a failed or missing check writes nothing.

## Code area
`app/about/`, `lib/content/about.ts`, `lib/server/contact.ts`, `lib/server/captcha.ts`, `components/about/`, `lib/env.ts`, `lib/server/env.ts`, `lib/nav.ts`, `tests/db/contact.test.ts`

## Requirements
- The page renders from the mockup, and a submitted contact form appears in the agent lead inbox (scope, Done when).

## Ratify
This decision was recorded by /develop, not deliberated. Run `/architect about & contact`
to deliberate and ratify it. Until then it stays flagged as an owed decision; it does not block marking the feature `done`.
