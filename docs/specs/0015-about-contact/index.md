# 0015 · About & contact

**Status**: Assumed
**Date**: 2026-10-26
**Authorized by**: joyshadman, during /develop ("use recommended")

## Owed decision
The mockup (`desing-check/aurevia-estates/about.html`) is full of specific agency facts with no source: a founder's name, founding year, timeline, team size, advisor photos and bios, testimonials, office address, hours, phone numbers, email, and a WhatsApp number. Also open: what the contact form collects, how it becomes a lead, and how it is protected from abuse.

## Assumption built on
- **Route**: `/about`, public and cached, no cookies. The nav's "About & contact" and "Sell" (`/about#contact`) entries go live.
- **No invented facts.** Story and values copy is drafted without names, dates, or numbers, and flagged for the agency to review. No timeline, team size, or testimonials until the agency supplies them.
- **Agency details** live in one typed file, `lib/agency.ts`: office address, hours, phone, WhatsApp number, email. Every value starts as `null`, and each line on the page hides while it is null, so nothing fake ships. The agency fills them in one place.
- **Team**: agents with `agent_is_public = true`, a name set, and not deleted, by name. Each card shows `agent_photo_url` (else initials), the name, `agent_title`, and `agent_bio`, each hidden while null (spec 0002's profile fields). The section hides when no agent is public.
- **Contact form** (`#contact`): full name (1 to 80), email (optional), phone (required, E.164 through the country select used by `/account`), "I'd like to" (Buy a home · Sell my property · Something else), message (1 to 1000), "Reply on WhatsApp". At least a phone is required so an agent can call.
- **Becomes a lead**: one `leads` row, source `CONTACT_FORM`, status NEW, no visitor, listing, conversation, or agent; `contact_*` from the form; `message` holds "<interest>: <message>"; a SYSTEM activity "Lead created from the contact form". It lands in spec 0009's inbox under Needs action and in every agent's Mine only (unassigned).
- **Abuse protection**: hCaptcha (spec 0008's `verifyCaptcha`), then a rate limit of 5 submissions per IP per hour in `rate_limits`. A refused captcha or limit returns a reason, never a thrown error.
- **After sending**: the form is replaced by "Thank you, <first name>. An Aurevia advisor will contact you within one working day." (copy for the agency to confirm).

## Code area
`app/about/`, `lib/agency.ts`, `lib/server/contact.ts`, `lib/server/auth-limits.ts`, `lib/nav.ts`

## Requirements
- **AC-1**: `/about` renders the story, values, public team, and contact sections from the mockup, with no invented facts.
- **AC-2**: a valid submission creates a NEW `CONTACT_FORM` lead that appears in `/dashboard/leads` under Needs action with the form's details.
- **AC-3**: the form needs hCaptcha and stops after 5 submissions per IP per hour.
- **AC-4**: invalid fields show their message after submit; nothing is saved.
- **AC-5**: agency contact lines show only when set in `lib/agency.ts`.

## Ratify
This decision was recorded by /develop, not deliberated. Run `/architect about & contact` to deliberate and ratify it. Until then it stays flagged as an owed decision; it does not block marking the feature `done`.
