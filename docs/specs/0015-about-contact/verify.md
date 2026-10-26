# Verify: About & contact · spec 0015 · updated 2026-10-26
_Steps derived from spec 0015 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. The spec is `Assumed`. A real submit needs a domain your hCaptcha site key accepts (it rejects `localhost`), or the hCaptcha test keys locally._

## UI / manual
- [ ] Header "About & contact" and "Sell" → `/about` and `/about#contact` → AC-1
- [ ] `/about` shows the story, the values band, the team, and the contact section, with no names, dates, numbers, or testimonials the agency hasn't supplied → AC-1
- [ ] Team shows only agents with a public profile; set `agent_title`, `agent_bio`, or `agent_photo_url` on one → it shows within the hour (cache) → AC-1
- [ ] With every value in `lib/agency.ts` null → no office, hours, phone, WhatsApp, or email lines; fill one → only that line appears → AC-5
- [ ] Submit with an empty name, a bad phone, or an empty message → that field's message shows; nothing is saved → AC-4
- [ ] Submit a valid enquiry → "Thank you, <first name>." → AC-2
- [ ] As an agent, `/dashboard/leads` → the enquiry is under Needs action: NEW, unassigned, "No home", "No viewing", the WhatsApp badge if ticked; the lead page shows the message as "<interest>: <message>" and the activity "Lead created from the contact form" → AC-2
- [ ] Send 6 enquiries from one IP within an hour → the 6th says "Too many messages from here" → AC-3
- [ ] Block hCaptcha (or fail it) → "We couldn't confirm you're a person" → AC-3
- [ ] At 390px wide, in dark mode, and with the keyboard → the form and sections work with no sideways scroll → AC-1

## Commands
- [ ] `npm run build` → `/about` builds as partial prerender (no cookie read) → AC-1

## Acceptance-criteria coverage
- AC-1: page sections, no invented facts, team, layout
- AC-2: valid submit to the inbox
- AC-3: rate limit, captcha
- AC-4: field errors
- AC-5: agency details lines
