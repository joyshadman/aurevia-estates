# Verify: AI home finder chat · spec 0006 · updated 2026-10-23
_Steps derived from spec 0006 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones. Covers build tasks 1 (tools and eval gate) and 2 (thin chat). Tasks 3 to 5 add their own steps._

## Before you start
- [ ] `.env.local` has `DATABASE_URL`, `DIRECT_URL`, `OPENROUTER_API_KEY`, `AI_CHAT_MODEL`, `BETTER_AUTH_SECRET`
- [ ] `npm run db:seed -- --sample` has loaded the 10 sample listings (AUR-1001 to AUR-1010, all PUBLISHED)
- [ ] A signed in visitor account exists (password sign up confirmed, spec 0008)

## Commands
- [ ] `npm run eval:assistant` → `PASS` with at least 18 of 20 and 0 grounding failures; `docs/evals/assistant-<date>.md` written with the model, the OpenRouter providers, and token totals → AC-1
- [ ] `npm run eval:assistant -- --only <case id>` → runs only that case, prints its tools and reply, writes no report → AC-1 (debug aid)
- [ ] `npm run typecheck && npm run lint && npm run build` → all pass; the route list has `/api/chat`, `/assistant`, `/assistant/c/[id]`

## UI / manual
- [ ] Signed out, open `/assistant` → sent to `/sign-in?next=%2Fassistant` → AC-2
- [ ] On `/assistant`, send "Family of five, up to 2.5 crore, Uposhohor or Shibgonj, 4 bedrooms, parking" → the reply streams in; the address bar becomes `/assistant/c/<id>` while it is still streaming (Send stays disabled) → AC-2
- [ ] The reply shows "Brief updated" and at most 3 cards with photo, price, beds, baths, size; badges "100% match" first, then lower percentages; non exact cards show "Close, but:" with what differs → AC-3, AC-4, AC-5
- [ ] The reply text has no tables, headings, or links, only paragraphs, `- ` lists, and bold → *Rendering*
- [ ] "Ask about this home" puts "Tell me more about AUR-xxxx" in the composer, not sent → AC-4
- [ ] Reload `/assistant/c/<id>` → the same messages and the same 3 cards come back from the database → AC-2, AC-18
- [ ] Closed tab: send a message and close the tab as soon as the address changes; reopen the conversation a minute later → the assistant reply is there → AC-2
- [ ] Sold listing: set a shown listing's status to SOLD, reopen the chat → its card reads "No longer available" with no actions; set it back to PUBLISHED → AC-18
- [ ] Changed price: change a shown listing's price, reopen the chat → the card shows the new price; the chat text stays as written → AC-18
- [ ] Open `/assistant/c/<a random uuid>` or another user's conversation id → the not found page (HTTP status is 200 because the page streams; no content leaks) → AC-11
- [ ] A screen reader hears the finished reply once, without `**` markers → AC-17

## Value sourcing
- [ ] Reply language: send romanized Bangla ("Amra 5 jon er family…") → English reply; Bangla script → Bangla reply; "2" with the toggle stored as `bn` (`localStorage["aurevia-chat-locale"]`) → Bangla → the latest message through `replyLocale`, else the request `locale`
- [ ] Cards on load: photo, price, and chips match the `listings` row now, not the stored tool output → `chatCards` over `listings`
- [ ] Assistant message id and conversation id: the conversation id in the first stream event's metadata matches `conversations.id` for the new row → server id generator
- [ ] Usage: `chat_messages.metadata.usage` holds input and output tokens for the reply → the model call's usage
- [ ] Grounding: `chat_messages.metadata.ungrounded` is absent on normal replies; the eval reports 0 grounding failures → `listing_recommendations` plus the starting listing

## Acceptance-criteria coverage
- AC-1: eval gate · AC-2: streaming, URL change, closed tab save · AC-3: brief updated · AC-4: at most 3 cards from the tool · AC-5: ranking, percent, close but · AC-8: reply language · AC-11: 404 for others' conversations (page only) · AC-17: one polite announcement · AC-18: current card data, no longer available
- Not yet covered (tasks 3 to 5): AC-6 and AC-7 in the UI (covered by the eval), AC-9, AC-10, AC-12 to AC-16, the rest of AC-11 and AC-17

---

# Task 3 (daily limit, interrupted replies, Retry, Stop) · added 2026-10-23

## UI / manual
- [ ] With today's `ai_usage_daily.message_count` at 39 for a visitor, send three messages at once (three tabs, or three `POST /api/chat`) → exactly one `200`, two `429 { reason: "daily_limit", resetsAt }`; the count ends at 40; `resetsAt` is the next midnight in Asia/Dhaka (18:00 UTC) → AC-9
- [ ] At 40, send from `/assistant` → the "You've reached today's 40 messages…" alert; the text goes back into the composer; no message bubble stays; no conversation or message row is written → AC-9
- [ ] At 30 used, open `/assistant` → "10 messages left today…" under the composer; after each reply it counts down → AC-9
- [ ] An agent sends any number of messages → never refused; no slot reserved → AC-9
- [ ] Press Stop while a reply streams → the reply is saved with `metadata.stopped = true` (not interrupted), shows "Stopped", has no Retry, and its slot is kept; tokens stop growing within about a second (recheck on a production build near the database) → AC-10
- [ ] Interrupted reply (make the provider fail, e.g. a bad `AI_CHAT_MODEL`) → partial text kept, "Interrupted" with Retry; the slot comes back; tokens are still recorded → AC-10, AC-15
- [ ] Retry → the reply is regenerated in place under the same message id (still one assistant message), and counts as one message → AC-10
- [ ] A finished or stopped reply never shows Retry; a forced `regenerate-message` for it answers `409 not_retryable` → AC-10
- [ ] `POST /api/chat/stop` with another user's conversation id → `404` → AC-11

## Commands
- [ ] `AI_CHAT_MODEL=openai/no-such-model npm run eval:assistant -- --only en-apartment-lift` → outcome `interrupted`; the eval user's `ai_usage_daily.message_count` stays 0 (reserved, then refunded) → AC-9, AC-10

## Value sourcing
- [ ] Limit slot: the reservation statement on `ai_usage_daily`, day in SQL as `Asia/Dhaka`; refunds return to the day reserved
- [ ] `remaining`: 40 minus today's count after the turn; on page load from `chatMessagesLeft`
- [ ] Stop: `conversations.stop_requested_at` later than `turn_started_at`; an old stop from an earlier reply is ignored
- [ ] Usage: `ai_usage_daily.input_tokens`/`output_tokens` grow on every outcome; `message_count` only through the reservation
