# Verify: Saved homes · spec 0014 · updated 2026-10-26
_Steps derived from spec 0014 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. The spec is `Assumed`. Signed in steps were not automated during /develop (hCaptcha blocks scripted sign in); run them by hand or with a test session._

## UI / manual
- [ ] Signed out, press a heart on `/properties` → `/sign-in?next=/properties...`; after signing in you land back on the same filtered page → AC-2
- [ ] Signed out, open `/saved` → sign in, then back to `/saved` → AC-3
- [ ] Signed in, press a heart on a card → it fills at once; reload → still filled → AC-1
- [ ] The same home shows as saved on the homepage, its property page ("Saved"), similar homes, and in a chat card → AC-1
- [ ] Press it again → unfilled; reload → still unfilled → AC-1
- [ ] Account menu → "Saved homes" → `/saved` lists saved homes, newest first, linking to their pages → AC-3
- [ ] Unpublish a saved home as an agent → `/saved` shows it as "No longer available" with a button to remove it → AC-3
- [ ] No saved homes → the empty state with "Browse homes" and "Ask the assistant" → AC-3
- [ ] Cut the network and press a heart → it flips back and a toast says it couldn't update → AC-1
- [ ] Keyboard: each heart is reachable, announced as "Save home" with its pressed state → AC-1

## Commands
- [ ] `npm run build` → public pages (`/`, `/properties`, `/properties/[slug]`) stay partial prerender with the 1 hour cache (no cookie read) → AC-4
- [ ] In the database: `saved_homes` exists with primary key `(profile_id, listing_id)` and both foreign keys `ON DELETE CASCADE` → AC-5
- [ ] Delete a test user or a listing → their `saved_homes` rows are gone → AC-5

## Acceptance-criteria coverage
- AC-1: save and unsave everywhere, rollback, keyboard
- AC-2: signed out redirect and return
- AC-3: `/saved` list, unavailable, empty
- AC-4: build output
- AC-5: table, cascade
