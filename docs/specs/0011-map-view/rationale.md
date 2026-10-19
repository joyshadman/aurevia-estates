# Rationale: 0011. Map view

Decision record for [spec 0011](index.md).

## Context

Buyers judge a home by where it is: how far the school, the mosque, the market, the airport. Families abroad can't drive past, so the location block and a map are how they get a feel for the place. Today spec 0009's property page shows only the area and a Google Maps link, and spec 0010's search has no way to see homes geographically.

Listings already store exact coordinates (spec 0005: entered or read from a Maps link, rounded to 6 decimals, inside Bangladesh; required to publish), and areas store center points. Nothing stores nearby places, and spec 0006 makes the assistant hand "what's nearby?" questions to an advisor because no data exists. Public map data for Sylhet (schools, clinics, travel times) is patchy, and the agency's promise is that everything is checked by hand.

Forces: phone performance on slow connections (map libraries are heavy, so they must not load until needed); cost that stays near zero at agency traffic; no vendor lock in that later forces a rewrite; the site's warm, calm look (spec 0003), which default map styles don't match; and accessibility, since a map alone is not usable by keyboard or screen reader. Spec 0009 left a slot for this block and spec 0010 a slot in its view toggle (`view=map`).

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

## Rationale

The deciding forces are look, cost, lock in, and trust. A vector renderer is the only way to make the map feel like the rest of the site (spec 0003's muted, warm palette with burgundy accents); Leaflet's raster tiles can't be restyled. Between vector options, MapLibre is open source and not tied to one tile vendor, so if MapTiler's pricing or terms change, only the style URL changes; Google and Mapbox both bind the code to their SDKs and bill per view. At agency traffic MapTiler's free tier is enough, and a referrer restricted key with a usage alert is the standard protection for a browser map key; proxying tiles would put every tile through our functions for little gain.

Nearby places are typed by agents because the agency's whole promise is hand checked information, public places data in Sylhet is patchy, and Google's terms tie Places results to Google's map. The same data then lets the assistant answer a question it currently has to hand off, without inventing anything, which serves the success metric (buyers who learn more book more viewings). Travel times are typed, not computed: an agent knows the 12 minute drive in traffic; a router doesn't.

Loading the map library only when a map is shown, and using a static image on property pages, keeps the property page (the page most visited and shared) light on phones. Showing every match on the search map, clustered with MapLibre's built in GeoJSON clustering, is right for an inventory in the hundreds; the installed MapLibre tile sources skill puts GeoJSON's practical limit far above that.

