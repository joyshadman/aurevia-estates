# Verify: about and contact · spec 0014 (assumed) · updated 2026-10-19
_Steps derived from the scope's Done when and spec 0014's assumption. `/check verify` runs these; `/test` locks the durable ones._

## Commands
- [ ] `npm run test:db` → `tests/db/contact.test.ts` passes (off and failed captcha write nothing, field errors, the lead shape, the inbox, a signed in visitor)
- [ ] `npm run build` → `/about` is a partial prerender; the page never reads the session

## UI / manual
- [ ] `/about` shows the hero, How we work, What you can count on, Our advisors (public agent cards only), and Contact, in that order → Done when
- [ ] No invented people, history, figures, quotes, or contact details appear; office lines show only once set in `lib/content/about.ts`
- [ ] Turn an agent's public card off in `/account` → they leave Our advisors on the next request
- [ ] Without the hCaptcha keys, Contact shows "Our enquiry form opens soon" and an assistant link, never the form
- [ ] With the keys: the header's "Sell" opens `/about?intent=sell#contact` with "Sell my property" chosen
- [ ] Submit with nothing filled → field errors for name, email or phone, and message; submit before the check → "Please complete the check"
- [ ] Submit a valid enquiry → "Thank you, <name>." takes focus; the lead appears under New in `/dashboard/leads` for every agent with "Assigned to me" off, source Contact form, the intent on the message's first line → Done when
- [ ] Signed in, submit → the lead links to that visitor
- [ ] Axe passes on `/about` in both themes (the hCaptcha iframe's own logo link is third party and excluded)
