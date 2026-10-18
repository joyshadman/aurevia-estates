# 0005. Agent listing management: rationale

The decision record behind [index.md](index.md). `/develop` does not need this file.

## Context

The assistant (feature 7) is only as good as the listings it can match, and spec 0002 makes "never suggest a home that isn't real and published" a database rule. Agents need a fast way to put real homes in, while every published listing stays complete: type fields, price, location, a cover photo, a description.

Forces:
- **Data shape is settled.** Spec 0002 fixes the tables, type rules, the status machine, and `publishListing`. This feature is the agent's surface over them.
- **Agents work in pieces.** Size, price, and photos often arrive days apart.
- **No upload yet.** Photo upload is feature 20; slice 1 must work with links.
- **No map yet.** Maps are feature 13, but publishing needs coordinates.
- **Small agency, several agents.** The mockup shows about 150 listings across several advisors, with the creator and the assigned agent sometimes different people.
- **Public pages are cached** (spec 0001), so changes must refresh them deliberately.

## Options considered

### Option 1: Dashboard form with partial drafts and server actions (chosen)
Drafts with three required fields, a live publish checklist, pasted photo links checked on the server, Maps link parsing, optimistic conflict checks.
**Pros**: fits how agents gather details; no new tables or vendors; complete listings guaranteed.
**Cons**: more validation paths (draft versus publish); link based photos are fragile.

### Option 2: Single full form, all fields required on every save
**Pros**: one validation path; simpler code.
**Cons**: agents lose work or enter placeholder values that leak into the assistant.

### Option 3: Pending copy for edits to published listings
Edits create a draft revision that is published separately.
**Pros**: typos never reach buyers.
**Cons**: a second copy of every field (schema change), merge rules, and twice the UI.

### Option 4: Bring forward map pin picking and photo upload
**Pros**: the best agent experience from day one.
**Cons**: pulls features 13 and 20 (MapLibre, MapTiler, Storage, signed uploads) into slice 1 and delays the thin thread.

## Rationale

The thin thread of slice 1 needs real published listings soon, so the design keeps to spec 0002's tables and adds no vendors. The one schema change (nullable price, address, and description, guarded by a wider published check) was found by the cross check: without it, drafts with three fields could not be stored at all, and the alternative of asking for those values up front would push agents into placeholder prices. Partial drafts match how agents actually work; the publish checklist plus the published save rule keep the "complete when public" promise that the assistant depends on.

The engineer chose to allow only known photo hosts rather than any `https` image. That gives a smaller attack surface for the server side image check and lets those hosts be optimized by `next/image`. Google Drive was included at the engineer's request; it is supported through Google's direct image address, with its throttling risk recorded.

"See all, edit own" widens spec 0002's read rule without touching the edit rule, so agents can answer buyers about colleagues' homes. Live edits on published listings avoid a schema change; the full check on every published save keeps them safe structurally, if not from typos. The `updated_at` check is cheap and stops silent overwrites between a creator and an assigned agent.

Pasting Maps links reuses a habit agents already have and keeps maps out of slice 1; following short links on the server is bounded to Google hosts so it can't be abused.
