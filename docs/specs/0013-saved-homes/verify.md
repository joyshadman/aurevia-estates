# Verify: saved homes · spec 0013 (assumed) · updated 2026-10-19
_Steps derived from the scope's Done when and spec 0013's assumption. `/check verify` runs these; `/test` locks the durable ones._

## Commands
- [ ] `npm run test:db` → `tests/db/saved-homes.test.ts` passes (published only, idempotent, the 200 cap under a race, paging, the chat list)
- [ ] `npm run build` → `/`, `/properties` and `/properties/[slug]` stay partial prerenders; no public page reads the session for hearts
- [ ] `npx prisma migrate diff` drift check is clean after `20261019200000_saved_homes`

## UI / manual
- [ ] Signed out, hearts show empty on the homepage, search, and similar homes; pressing one goes to `/sign-in?next=<this page>` and nothing is saved after sign in
- [ ] Signed in, a heart on a search card fills at once; reload → still filled; the same home's page shows "Saved" beside Share → Done when
- [ ] Unheart it → it empties at once; `/saved` no longer lists it after a reload → Done when
- [ ] Turn off the network and press a heart → it reverts with a toast
- [ ] `/saved` lists homes newest first, 24 per page with "Show more homes"; an unhearted card stays until reload so a slip can be undone → Done when
- [ ] Unpublish a saved home → `/saved` shows "<title> · No longer available" with Remove; Remove drops the row
- [ ] With no saved homes, `/saved` shows the empty state with "Browse homes" and "Ask the assistant"
- [ ] The avatar opens the account menu: Your account, Saved homes, Dashboard (agents only), Sign out
- [ ] Sign out from the menu, then press a heart → sign in (hearts from the last person never linger)
- [ ] In the assistant, the left pane has Conversations and Saved tabs (arrow keys switch them); hearting a chat card adds it to Saved without a reload; the list shows title, area, price, up to 20
- [ ] On a phone, the Conversations drawer holds the same tabs
- [ ] Axe passes on `/saved` and the assistant pane in both themes; the heart keeps keyboard focus while saving
