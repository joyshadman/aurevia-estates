# Verify: AI listing descriptions · spec 0021 · updated 2026-10-26
_Steps derived from spec 0021 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. Steps marked "(run by /develop)" passed on 2026-10-26 with a live model call; the browser steps have not been clicked through yet._

## UI / manual
- [ ] In the listing editor, change bedrooms, then "Draft with AI" → the box fills with a draft that uses the new bedroom count, and "Draft from AI. Check every fact before saving." shows → AC-1
- [ ] Click "Undo" → the old text comes back → AC-3
- [ ] Draft, then leave without saving and reload → the old description is still saved → AC-3
- [ ] Read the draft against the fields → no price, no "negotiable", no view, distance, school, or material that isn't a field → AC-2

## Commands
- [x] Draft for AUR listing "Ambarkhana Executive Suite" (8 facts) → 67 words, no price words, no markdown (run by /develop) → AC-1, AC-2
- [x] The listing's `updated_at` is unchanged after drafting (run by /develop) → AC-3
- [x] With `ai_usage_daily.message_count = 30` for the agent → `draft_limit`; a profile that can't edit the listing → refused (run by /develop) → AC-4
- [ ] Set `AI_CHAT_MODEL` to a model id that doesn't exist, draft → "Couldn't draft right now. Try again.", the box unchanged, and the day's count not increased → AC-5

## Acceptance-criteria coverage
- AC-1: UI 1, cmd 1 · AC-2: UI 4, cmd 1 · AC-3: UI 2, 3, cmd 2 · AC-4: cmd 3 · AC-5: cmd 4
