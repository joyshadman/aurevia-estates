# Verify: AI home finder chat · spec 0006 · updated 2026-10-19
_Steps derived from spec 0006 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

The UI steps need a signed in visitor (feature 5) and a working model (`OPENROUTER_API_KEY` in `.env.local`). The eval gate (AC-1) must pass before you trust any UI step.

## Commands
- [ ] `npm run eval:assistant` → at least 18 of 20 cases pass, zero grounding failures, report in `docs/evals/assistant-<date>.md` → AC-1
- [ ] `npm run test:db` → `tests/db/assistant.test.ts` and `tests/db/conversations.test.ts` pass → AC-3 to AC-15, AC-18
- [ ] `npm run build` → `/assistant`, `/assistant/c/[id]`, `/dashboard/assistant-facts` build as partial prerenders; `/api/chat` is dynamic → AC-2
- [ ] `npm run test:e2e` → styleguide axe passes in both themes with the new bottom sheet → AC-17

## UI / manual
- [ ] Signed out, open `/assistant` → sent to `/sign-in?next=%2Fassistant` → AC-2
- [ ] Send "Family of five, up to 2.5 crore, Uposhohor or Shibgonj, 4 bedrooms, parking" → reply streams; the address becomes `/assistant/c/<id>` mid reply; brief pane fills; up to 3 cards with scores → AC-2, AC-3, AC-4, AC-5
- [ ] Close the tab mid reply, reopen the conversation → the full reply is there → AC-2
- [ ] Reload → same messages and cards; a card's price matches the listing now → AC-18
- [ ] Mark a shown listing sold in the dashboard, reload the chat → "No longer available" on its card, chat text unchanged → AC-18
- [ ] Press Show more → 3 more cards, no new model reply; the message count doesn't drop → AC-4
- [ ] A brief no listing fully meets → "doesn't meet every point", cards labelled "Close, but" with what differs → AC-5, AC-6
- [ ] Ask "Does it flood in monsoon?" → advisor handoff, no invented claim → AC-7
- [ ] Write in Bangla script → Bangla reply; romanized Bangla → English; send "2" with the toggle on বাংলা → Bangla → AC-8
- [ ] Toggle বাংলা, reload → still বাংলা; greeting and chips in Bangla → AC-8, AC-16
- [ ] With 10 or fewer messages left, the composer shows the count; at 0 it's disabled with the reset message → AC-9
- [ ] Press Stop mid reply → it stops within about a second, the reply shows "Stopped", no Retry → AC-10
- [ ] Force a model failure (bad `AI_CHAT_MODEL`) → partial reply shows "Interrupted" with Retry; Retry replaces it in place → AC-10
- [ ] Rename a conversation (1 to 60 characters), delete one (confirm) → list updates; deleting the open one goes to `/assistant` → AC-11
- [ ] Open another user's `/assistant/c/<id>` → 404 → AC-11
- [ ] Remove an area from the brief → a centered note "You removed … from your brief." appears; buttons are disabled while a reply streams → AC-12
- [ ] `/assistant?q=flat%20near%20MC%20college` → composer filled, not sent; `/assistant?listing=<published slug>` → greeting names it → AC-13
- [ ] As an agent, edit `/dashboard/assistant-facts`, preview, save → next reply uses it; restore an old version → it becomes live as a new version → AC-14
- [ ] Below `lg`: conversations open in a drawer, the brief in a bottom sheet; Tab reaches every control; a screen reader hears the finished reply once → AC-17

## Value sourcing checks
- [ ] Limit slot: at 39 used, send from three tabs at once → exactly one accepted (`tests/db/assistant.test.ts`)
- [ ] `resetsAt`: the 429 body's time is the next midnight in Asia/Dhaka
- [ ] `remaining`: after a reply, the count equals 40 minus today's `ai_usage_daily.message_count`
- [ ] `metadata.locale`: a Bangla reply is stored `bn`; an empty reply falls back to the toggle
- [ ] Stop: `stop_requested_at` later than `turn_started_at` ends the call; an older stop does nothing
- [ ] Header count: "Searching N verified listings" changes after a publish or unpublish (tag `listings`)
- [ ] Brief labels: area and amenity names follow the toggle (English or Bangla names from the database)
- [ ] Removal note language follows the latest assistant reply's locale
- [ ] Fact sheet versions show the author's full name and the time in Asia/Dhaka

## Acceptance-criteria coverage
- AC-1 eval command · AC-2 first send, closed tab, sign in steps · AC-3 brief step and tests · AC-4 Show more step and tests · AC-5, AC-6 ranking steps and tests · AC-7 off listing step and eval · AC-8 language steps · AC-9 limit steps and tests · AC-10 Stop and Retry steps and tests · AC-11 rename, delete, ownership steps and tests · AC-12 removal step and tests · AC-13 starting point steps and tests · AC-14 fact sheet step and tests · AC-15 usage and grounding tests · AC-16 chips step · AC-17 layout step and axe · AC-18 card steps and tests
