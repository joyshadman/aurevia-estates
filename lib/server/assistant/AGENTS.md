# AI assistant (`lib/server/assistant`)

## Overview

The server side of the AI home finder chat (spec 0006): one chat turn, its tools, the system prompt, the grounding check, and the model setup. The chat route and the eval both call `runAssistantTurn`, so the eval tests the real code path.

## Key files

| File | Owns |
|---|---|
| `turn.ts` | `runAssistantTurn` (open turn, stream, save on every outcome) and `turnInput` |
| `tools.ts` | `updateBrief`, `searchListings`, `getListingDetails`, built per turn by `assistantTools(scope)` |
| `brief.ts` | the search brief: slug to id mapping, `briefView`, `briefCriteria` |
| `system-prompt.ts` | the system prompt, rebuilt every turn |
| `history.ts` | message types (`AssistantUIMessage`, `ChatMetadata`) and the history the model reads |
| `grounding.ts` | flags replies that name a listing the conversation never showed |
| `model.ts` | the OpenRouter model, routing rules, and `pinnedProviders` |
| `../../domain/match-score.ts` | the deterministic match score and ranking |

## Commands

```bash
# The model eval gate (AC-1). Needs .env.local and `npm run db:seed -- --sample`.
npm run eval:assistant
```

## Conventions

- AI SDK is v7 (`ai@7`). Check every function and option against `node_modules/ai/docs/` before using it; names changed from older versions (`onEnd` not `onFinish`, `isStepCount` not `stepCountIs`, `instructions` not `system`).
- The model never supplies or receives user, conversation, or listing ids. Tools get them from the `ToolScope` closure; the only id the model passes is a listing code already shown.
- Scores, ranking, and "close, but" lines are computed by `matchScore`, never by the model.
- `toModelOutput` must work from the stored tool output alone: `convertToModelMessages` reruns it on history.
- Rerun `npm run eval:assistant` whenever `AI_CHAT_MODEL`, the prompt, the tools, or the scoring change.

## Gotchas

- The caller must read `stream` to the end; the save runs in `onEnd`. The route does this with `consumeSseStream` so a closed tab still saves.
- Recommendation rows are written when the turn is saved, so tools track this turn's cards in `scope.shownThisTurn`.
- The eval runs outside Next with `tsx --conditions=react-server` so `server-only` imports resolve.
- `turn_started_at` guards one reply per conversation; a value older than 90 seconds counts as cleared.

## Agent skills

- [ai-sdk](../../../.claude/skills/ai-sdk/): `vercel/ai`, AI SDK functions, tools, streaming, `useChat`

## Related specs

- [0006 AI home finder chat](../../../docs/specs/0006-ai-home-finder-chat/index.md)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
