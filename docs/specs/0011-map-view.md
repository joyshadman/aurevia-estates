# 0011. Map view

**Date**: 2026-10-19
**Status**: Proposed

## Summary

Listings get maps in two places. Search (spec 0010) gains a Map view next to Grid and List, showing every home that matches the filters as price pins that cluster when crowded, and property pages (spec 0009) gain a static map with the home's pin that turns interactive on tap, beside an "Around the address" list of nearby places. Maps are drawn with the open source MapLibre library over MapTiler's tiles (a free tier key, locked to the site's addresses), and nearby places are typed by agents (name, kind, minutes, walk or drive), so the assistant can answer "what's nearby" from facts the agency checked. If the map service is down, pages keep working without it.

## Context

Buyers judge a home by where it is: how far the school, the mosque, the market, the airport. Families abroad can't drive past, so the location block and a map are how they get a feel for the place. Today spec 0009's property page shows only the area and a Google Maps link, and spec 0010's search has no way to see homes geographically.

Listings already store exact coordinates (spec 0005: entered or read from a Maps link, rounded to 6 decimals, inside Bangladesh; required to publish), and areas store center points. Nothing stores nearby places, and spec 0006 makes the assistant hand "what's nearby?" questions to an advisor because no data exists. Public map data for Sylhet (schools, clinics, travel times) is patchy, and the agency's promise is that everything is checked by hand.

Forces: phone performance on slow connections (map libraries are heavy, so they must not load until needed); cost that stays near zero at agency traffic; no vendor lock in that later forces a rewrite; the site's warm, calm look (spec 0003), which default map styles don't match; and accessibility, since a map alone is not usable by keyboard or screen reader. Spec 0009 left a slot for this block and spec 0010 a slot in its view toggle (`view=map`).

## Requirements

**User stories**:
- As a buyer, I want to see the homes matching my search on a map, so I can judge locations together.
- As a buyer, I want to see where a home is and what's around it, with travel times.
- As a buyer, I want the assistant to tell me what's near a home.
- As an agent, I want to record the places that matter near a listing.

**Acceptance criteria**:
- **AC-1**: Search map view: spec 0010's view toggle offers Grid, List, and Map (`view=map`). The map shows every PUBLISHED listing matching the current filters, up to the newest 500 (above that, a note reads "Showing the newest 500 of N"), each as a pin labelled with its short price ("৳ 6.5 Cr", "৳ 85 L"). The Map view ignores paging and sort; while it loads it shows a skeleton. Nearby pins group into numbered clusters that split as the visitor zooms; selecting a cluster zooms into it.
- **AC-2**: Selecting a pin opens a small card (the cover at 160×120, or the framed house icon without one; the price; the title; the area; the beds, baths, sqft, or katha chips as on spec 0003 cards) that links to `/properties/<slug>`; only one card is open at a time; Escape, selecting the map, or selecting a cluster closes it. Pins have touch targets of at least 24 px.
- **AC-3**: The search map frames all matching homes when it loads (48 px padding; a single home at zoom 15), or shows Sylhet city when there are none, with "No homes match these filters" over it. It reframes only when the set of homes changes; camera movement is instant for visitors who prefer reduced motion. The result total and active chips (spec 0010) stay above the map.
- **AC-4**: Property page (PUBLISHED and SOLD, spec 0009): the location block shows a static map image (640×360 shown, requested at 2× scale, zoom 15, one burgundy marker, a plain `<img>`) of the home's pin, with a "Show interactive map" button that replaces it with a live map (zoom, pan) centered on the pin. The Google Maps link stays.
- **AC-5**: "Around the address": up to 8 nearby places beside the map, in the agent's order, each with an icon for its kind, the name, and "<minutes> min walk" or "<minutes> min drive". The list is hidden when the listing has none.
- **AC-6**: Listing editor (spec 0005): an "Around the address" section to add, edit, reorder, and remove up to 8 places (name 1 to 80 characters; kind from School, Hospital or clinic, Mosque, Market, Shopping, Park, Transport, Landmark, Other; minutes 1 to 120; Walk or Drive). The places save with the form (spec 0005's save, with its conflict check and the same editing rights), replacing the listing's set; saving without them leaves the set alone. They are optional for publishing.
- **AC-7**: Assistant: `getListingDetails` (spec 0006) includes the listing's nearby places, and the assistant answers "what's nearby?" from them only; anything not listed still goes to an advisor. One new eval case checks it, and the eval passes.
- **AC-8**: Performance: the map library loads only when a map is shown (the Map view, or after "Show interactive map"); property pages and the Grid and List views never load it.
- **AC-9**: Failure: when the map key is missing or the map service fails (the static image fires its error event, including a 403 for a bad or restricted key; the interactive map reports a style or tile error, or its style hasn't loaded 8 seconds after it starts; or the map library itself fails to load), property pages keep the address, nearby places, and the Google Maps link (no broken image), and the Map view shows "The map isn't available right now" with a link back to the grid. Nothing else on either page breaks.
- **AC-10**: Accessibility (WCAG 2.2 AA): every map region is labelled with the number shown ("Map of 24 homes matching your search"); the search map starts with a visible, focusable "Skip the map, show as a list" link to the List view, which is the full keyboard and screen reader equivalent of the map (a conforming alternative); the static map image has alt text ("Map showing <title> in <area>").
- **AC-11**: Freshness: a change to a listing's coordinates, status, price, or nearby places (spec 0005 actions refreshing `listing:<id>` and `listings`; a nearby places edit counts as a public change) shows on maps and the property page on the next request.
- **AC-12**: The maps use a light brand style matching spec 0003: a committed `lib/maps/style.json` built from a MapTiler base style (sources and glyphs filled in with the key at runtime), with muted land, water, and roads, burgundy (`#853953`) pins and clusters, and MapTiler's Noto Sans glyphs for labels (Inter isn't available as map glyphs).

## Options considered

### Option 1: MapLibre over MapTiler tiles, agent entered places (chosen)

The open source MapLibre GL JS library draws vector maps from MapTiler's hosted tiles with a custom style; MapTiler's static maps API draws the property page preview; nearby places live in a new table that agents fill in.

**Pros**:
- Open source renderer: the tile host can change later without rewriting map code.
- Brandable vector style; MapTiler's free tier covers an agency's traffic.
- Places are accurate local knowledge, matching the hand checked promise, and give the assistant facts to answer from.

**Cons**:
- A public browser key to restrict and watch.
- Agents must type the places; listings without them show no list.

### Option 2: Google Maps with Google Places

Google's map library and static maps, with nearby places looked up from Google Places around each home.

**Pros**:
- Familiar to buyers; the best street detail in Bangladesh; places fill themselves.

**Cons**:
- A billing account, cost that grows with views, and terms that tie Places data to Google's own map.
- Automatic places can be wrong or irrelevant in Sylhet, with no agency check.

### Option 3: Leaflet with free raster tiles

The small, proven Leaflet library with raster tiles from a free tier tile host, clustering through a plugin.

**Pros**:
- Simplest library, smallest bundle, easy keyboard markers.

**Cons**:
- Raster tiles look generic and can't be restyled to the brand.
- Still needs a tile host and key (OpenStreetMap's own tile servers forbid this kind of use).

## Decision

**Chosen option**: Option 1: MapLibre over MapTiler tiles, with agent entered nearby places.

The search Map view and the property page's interactive map use MapLibre GL JS with a brand style on MapTiler vector tiles, the property preview uses MapTiler's static map images, and nearby places are a new agent managed table that the page and the assistant read.

**Implementation skills**: `maplibre-tile-sources`, `maplibre-source-wiring`, `maplibre-cartography`, `maplibre-fonts-glyphs` (`maplibre/maplibre-agent-skills`, `.claude/skills/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`) · `prisma-client-api` (`prisma/skills`, `.claude/skills/prisma-client-api/`) · `supabase-postgres-best-practices` (`supabase/agent-skills`, `.claude/skills/supabase-postgres-best-practices/`) · `ai-sdk` (`vercel/ai`, `.claude/skills/ai-sdk/`)

## Rationale

The deciding forces are look, cost, lock in, and trust. A vector renderer is the only way to make the map feel like the rest of the site (spec 0003's muted, warm palette with burgundy accents); Leaflet's raster tiles can't be restyled. Between vector options, MapLibre is open source and not tied to one tile vendor, so if MapTiler's pricing or terms change, only the style URL changes; Google and Mapbox both bind the code to their SDKs and bill per view. At agency traffic MapTiler's free tier is enough, and a referrer restricted key with a usage alert is the standard protection for a browser map key; proxying tiles would put every tile through our functions for little gain.

Nearby places are typed by agents because the agency's whole promise is hand checked information, public places data in Sylhet is patchy, and Google's terms tie Places results to Google's map. The same data then lets the assistant answer a question it currently has to hand off, without inventing anything, which serves the success metric (buyers who learn more book more viewings). Travel times are typed, not computed: an agent knows the 12 minute drive in traffic; a router doesn't.

Loading the map library only when a map is shown, and using a static image on property pages, keeps the property page (the page most visited and shared) light on phones. Showing every match on the search map, clustered with MapLibre's built in GeoJSON clustering, is right for an inventory in the hundreds; the installed MapLibre tile sources skill puts GeoJSON's practical limit far above that.

## Feature design

**Data model sketch**:
New table `listing_nearby_places` (migration `listing_nearby_places`):

| Column | Type | Null | Rules |
|---|---|---|---|
| `id` | uuid (v7) | no | primary key |
| `listing_id` | uuid → `listings.id` | no | `on delete cascade`; index |
| `name` | text | no | check `char_length(name) between 1 and 80` |
| `kind` | enum `nearby_place_kind` (SCHOOL, HEALTH, MOSQUE, MARKET, SHOPPING, PARK, TRANSPORT, LANDMARK, OTHER) | no | |
| `minutes` | smallint | no | check `minutes between 1 and 120` |
| `mode` | enum `travel_mode` (WALK, DRIVE) | no | |
| `sort_order` | integer | no | unique `(listing_id, sort_order)` |

One listing has 0 to 8 places (the limit enforced in the save). Row level security enabled with no policies, plus the guarded revokes (spec 0002). No other schema change: pins use `listings.latitude` and `longitude`.

**State transitions**: none. Maps show PUBLISHED listings only (search); the property page follows spec 0009's status rules.

**API surface**:
| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `searchMapPoints(filters)` | server read, `lib/server/public-search.ts`, `'use cache'`, tag `listings`, the same `cacheLife` rule as spec 0010 (minutes with a title keyword, else hours), same `buildWhere` | normalized filters | `{ points: {...}[], total }` with points `{ id, slug, lat, lng, priceBdt, title, areaName, propertyType, bedrooms, bathrooms, builtUpSqft, landKatha, cover }` (newest 500) and the full match count | public | none |
| `/properties?view=map` | page (spec 0010) | URL params | the map view | public | map unavailable state (AC-9) |
| `getPublicListing(slug)` | spec 0009 read, extended | slug | adds `nearbyPlaces: { name, kind, minutes, mode }[]` in order | public | none |
| `saveListing` / `publishWithSave` | spec 0005 actions, extended | `fields.nearbyPlaces?: { name, kind, minutes, mode }[]` (max 8) | as before | agent with editing rights | `invalid` (per place) |
| `getListingDetails` | spec 0006 tool, extended | refCode | adds `nearbyPlaces` (name, kind, minutes, mode) | the turn | as before |
| Static map URL | built in `lib/maps.ts` | lat, lng, size | MapTiler static map image URL with one brand colored marker | public key | image error → AC-9 fallback |

`lib/maps.ts` (shared, no server only code) holds the style URL builder, the static map URL builder, the short price formatter, and the place kind labels and icons. The MapLibre components live in `components/maps/` and load with `next/dynamic` (`ssr: false`), so nothing on the server or in the first page load imports the library. The style is a MapTiler base style adjusted to spec 0003's tokens (muted land, water, and roads; burgundy pins and clusters; Inter labels); light theme only for now.

Search map rendering: one GeoJSON source of the points with clustering on (radius 50, max zoom 14), cluster circles sized by count, unclustered points drawn as price labels. The map components are client components (`"use client"`) that load MapLibre with `next/dynamic` and `ssr: false` inside them (Next 16 forbids `ssr: false` in server components). Keyboard and screen reader users use the "Skip the map" link and the List view (AC-10); no hidden synced list is built.

Short price rule (`lib/maps.ts`): below 1 crore, whole lakh rounded ("৳ 85 L"); at or above 1 crore after rounding, crore with one decimal, a trailing ".0" dropped ("৳ 6.5 Cr", "৳ 1 Cr", "৳ 10 Cr"); so 99.5 lakh shows "৳ 1 Cr" and 10.04 crore "৳ 10 Cr". PUBLISHED listings always have a price and coordinates (spec 0005's database check), so every point has both.

Nearby places save (spec 0005 `saveInTransaction`, same pattern as amenities): when `fields.nearbyPlaces` is present, delete the listing's places and insert the new list in the same transaction (delete first, so the unique order never collides), `sort_order` 0 to N in form order; names trimmed and unique per listing (case insensitive); per row errors reported as `nearbyPlaces.<index>.<field>`. The save already touches `updated_at` through `touchListing`, so the conflict token covers place edits, and a place edit on a public listing is a public change for cache refresh. The assistant change goes into `listingFacts` (which `getListingDetails` and the starting listing use), and the spec 0006 prompt rule that sends "what's nearby" to an advisor becomes: answer from the listed nearby places only, else an advisor.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Search map | which homes | spec 0010's `buildWhere` for the URL's filters, PUBLISHED only, cap 500 newest |
| Search map | pin position | `listings.latitude`, `longitude` |
| Search map | pin label | `price_bdt` through the short price rule above |
| Pin card | photo, price, title, area, facts | the point's `cover`, `priceBdt` (`formatPrice`), `title`, `areaName`, spec 0003 `SpecChips` fields |
| Empty map | center | Sylhet city constant in `lib/maps.ts` (24.8949, 91.8687, zoom 12) |
| Property map | pin, static image | `latitude`, `longitude`; MapTiler static maps (the base style's map id, 640×360 @2x, zoom 15, burgundy marker) with `NEXT_PUBLIC_MAPTILER_KEY`; hidden in the agent preview when coordinates are empty |
| Nearby list | places, order, icon, text | `listing_nearby_places` by `sort_order`; `kind` → label and icon in `lib/maps.ts`; "<minutes> min walk/drive" from `minutes`, `mode` |
| Editor | places | the form's list, saved through `saveListing` (`fields.nearbyPlaces`) |
| Assistant | nearby facts | `listing_nearby_places` for the listing, via `getListingDetails` |
| Map style | colors, font | spec 0003 tokens (light values), Inter |
| Key | tiles and static images | `NEXT_PUBLIC_MAPTILER_KEY` (public, referrer restricted) |

**Key invariants**:
- Maps never show a listing that isn't PUBLISHED (search) or isn't allowed by spec 0009's rules (property page).
- Nearby places are only ever the agent's list; nothing is looked up or invented, by the page or the assistant.
- The map library never loads on a page or view that doesn't show an interactive map.
- A missing key or a failing map service never breaks a page.
- Each listing has at most 8 nearby places, in a unique order.

**Security model**:
- Public: map points and nearby places are public listing facts (already on the page); no personal data.
- Agents: edit nearby places only on listings they may edit (spec 0005's `canEditListing`, under its row lock and conflict token).
- The MapTiler key is public by nature: restricted to the site's domains and localhost in the MapTiler dashboard, with a usage alert; it grants map reads only.
- The assistant reads nearby places as data, like the description (spec 0006 prompt rules).

**Configuration required**:
- `NEXT_PUBLIC_MAPTILER_KEY`: MapTiler Cloud key (free tier). Production and staging keys are restricted by allowed origins to their domains; MapTiler's allowlist can't match every Vercel preview address, so previews and local development use a separate key restricted to `localhost` where possible, with a low monthly usage alert. A monthly usage alert on every key. Added to `lib/env.ts` as optional (maps degrade without it, AC-9) and to `.env.example`.
- Prerequisite: a MapTiler Cloud account.
- New dependency: `maplibre-gl` (current release at build time; pin it, and check the installed `maplibre-v6`-era notes in the MapLibre skills if the major version changed).

**Critical test scenarios**:
- Search map: 30 matching homes, some 200 m apart: clusters show counts, zooming splits them, a pin opens a card linking to the page; changing filters reframes, verifies **AC-1**, **AC-2**, **AC-3**.
- Empty: filters with no matches center on Sylhet with the message, verifies **AC-3**.
- Property page: the static map shows the pin; "Show interactive map" loads the live map; the network shows no map library before that, verifies **AC-4**, **AC-8**.
- Nearby places: an agent adds 3 places, reorders, saves; the page lists them in order with icons and "12 min drive"; a 9th is refused; a second agent's stale save is refused (spec 0005), verifies **AC-5**, **AC-6**.
- Assistant: "What's near AUR-1042?" answers from the listed places; "Is there a hospital nearby?" with none listed goes to an advisor; the eval passes, verifies **AC-7**.
- No key: unset the key; property pages show the list and the Maps link, the Map view shows the unavailable message, verifies **AC-9**.
- Keyboard: the first Tab on the Map view reaches "Skip the map, show as a list", which opens the List view with the same filters; axe passes, verifies **AC-10**.
- Over 500: with 520 matches, the note shows "Showing the newest 500 of 520", verifies **AC-1**.
- Bad key: a restricted key makes the static image fail and the fallback appear, verifies **AC-9**.
- Freshness: move a listing's coordinates; the pin moves on the next request, verifies **AC-11**.

## Build plan

Tracer Bullet: one real map end to end first (search points to pins on a branded map), then the property page, then nearby places from the database to the page and the assistant.

1. Thin thread: `maplibre-gl`, `NEXT_PUBLIC_MAPTILER_KEY` in `lib/env.ts` and `.env.example`, `lib/maps.ts` (style URL, short price, Sylhet center), `searchMapPoints`, the Map option in spec 0010's toggle with a lazily loaded map, clustered price pins, framing, and the unavailable state, satisfies **AC-1**, **AC-3**, **AC-8**, **AC-9**, **AC-11**
2. Pins and style: the pin card, `lib/maps/style.json`, the "Skip the map" link, the 500 cap note, satisfies **AC-1**, **AC-2**, **AC-10**, **AC-12**
3. Property page map: the static image with the marker, "Show interactive map", alt text and fallback, satisfies **AC-4**, **AC-8**, **AC-9**, **AC-10**
4. Nearby places: the `listing_nearby_places` migration (enums, checks, RLS), the editor section and the save extension (spec 0005), the list on the property page (spec 0009), satisfies **AC-5**, **AC-6**, **AC-11**
5. Assistant: `getListingDetails` with nearby places, the prompt rule, one eval case, rerun the eval, satisfies **AC-7**

## Consequences

**Positive**:
- Buyers see where homes are, together in search and individually on each page, with the places that matter and real travel times.
- The assistant can answer location questions from checked facts instead of handing every one to an advisor.
- No vendor lock in: the renderer is open source; only the tile host's URL and key are MapTiler's.
- Property pages stay light; the library loads only on demand.

**Negative / tradeoffs**:
- A new account and a public key to restrict and watch; heavy traffic beyond the free tier costs money.
- Agents must type nearby places for every listing to get the benefit; many listings may show none at first.
- Typed travel times can go stale (a new road, a moved school); nothing flags them.
- Keyboard and screen reader users get the List view instead of the map itself; pins aren't individually reachable by keyboard.
- Light map style only; dark theme users see a light map until a dark style is added.
- The search map sends up to 500 points per uncached search.

**Neutral**:
- Spec 0005 gains the nearby places section and `fields.nearbyPlaces`; spec 0006's `getListingDetails` and prompt change (one more eval case); spec 0009's location block and spec 0010's view toggle gain the maps.
- Four MapLibre agent skills were installed for this build.

## Follow-up

- [ ] `/sync` (or `/audit`): add the four `maplibre-*` skills to the `## Agent skills` section of `AGENTS.md` (area: maps, `components/maps/`), and record MapTiler's skills and the third party map skills as declined.
- [ ] Spec 0005: record the nearby places editor section and `fields.nearbyPlaces`.
- [ ] Spec 0006: record nearby places in `getListingDetails`, the prompt rule, and the new eval case.
- [ ] Spec 0009 and spec 0010: record the map block and `view=map` as built by this feature.
- [ ] A dark map style when the dark theme gets map attention.
- [ ] Launch checklist: create the MapTiler account, restrict the key to the real domains, and set the usage alert.
