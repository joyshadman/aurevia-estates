# 0021 · AI listing descriptions

**Status**: Assumed
**Date**: 2026-10-26
**Authorized by**: joyshadman, during /develop ("architect with recommended")

## Owed decision
What the draft is built from, what the model is told, where the draft goes, how often an agent can ask, and what "nothing publishes without approval" means in practice.

## Assumption built on
- **Where**: a "Draft with AI" button by the description field in the listing editor. It calls a server action `draftDescription({ listingId, fields })`.
- **Input**: the editor's current values (not yet saved), validated with the same `listingPatch` schema; the server adds the area name and amenity names from their ids and checks the agent can edit the listing. The existing description is not sent.
- **Model**: the AI SDK over OpenRouter, the same `AI_CHAT_MODEL` (spec 0001), `generateText`, temperature 0.4, a 45 second timeout, at most 600 output tokens.
- **Rules given to the model**: English, 60 to 160 words (short when there are few facts, never padded; a first live run gave 67 words for a listing with eight facts), two or three short paragraphs, plain text (no markdown, no headings, no emoji). Use only the given facts; never invent views, distances, schools, materials, or legal status; never state a price or "negotiable" (the page shows those); no superlatives like "best" or "luxurious" unless a fact supports it. Unknown fields are left out, not guessed.
- **Approval**: the draft only fills the description box in the browser and says "Draft from AI. Check every fact before saving." Drafting writes nothing to the listing. The agent edits, then saves or publishes through the normal actions; a published listing changes only when the agent saves.
- **Limit and usage**: 30 drafts per agent per Dhaka day, counted in `ai_usage_daily` (`message_count`, plus tokens), refused with `draft_limit` after that.
- **Failure**: a model error or timeout gives `draft_failed` ("Couldn't draft right now. Try again."), reported to Sentry; the box keeps whatever the agent had.

## Code area
`lib/server/listing-description.ts`, `app/dashboard/listings/actions.ts`, `app/dashboard/listings/messages.ts`, `app/dashboard/listings/[id]/listing-editor.tsx`, `lib/server/ai-usage.ts`

## Requirements
- **AC-1**: From the editor, "Draft with AI" fills the description box with a 60 to 160 word English draft built from the current field values.
- **AC-2**: The draft states no fact that isn't in the fields (no price, no invented features).
- **AC-3**: Drafting never saves or publishes anything; the listing changes only after the agent saves.
- **AC-4**: Only an agent who can edit the listing can draft; the 31st draft in a Dhaka day is refused.
- **AC-5**: A model failure leaves the box as it was and shows a retry message.

## Ratify
This decision was recorded by /develop, not deliberated. Run `/architect AI listing descriptions` to deliberate and ratify it. Until then it stays flagged as an owed decision; it does not block marking the feature `done`.
