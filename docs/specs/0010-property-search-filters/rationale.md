# Rationale: 0010. Property search and filters

Decision record for [spec 0010](index.md).

## Context

Buyers who know roughly what they want (an area, a budget, a type) need to browse every available home without starting a chat, and the homepage, property pages, and saved homes all need a place to send them. Today the only way to see listings is the assistant, three at a time.

Spec 0002 already provides `searchPublishedListings` (PUBLISHED only, filters for area ids, property types, price range, minimum bedrooms, every chosen amenity, keyset paging newest first, up to 24 per page). Spec 0003 provides `PropertyCard` in grid and list layouts, and spec 0009 makes each card link to a property page. Spec 0005 refreshes the `listings` cache tag on every public listing change. The mockup (`desing-check/aurevia-estates/properties.html`) shows a keyword box, filters with counts, sort options, active filter chips, and an assistant nudge among the results.

Forces: the page is public and should be fast and cacheable on slow phone connections; buyers in Sylhet talk about price in lakh and crore; search engines must not index thousands of near duplicate filter combinations; and the success metric is bookings through the assistant, so discovery should feed the chat rather than compete with it. The agency has tens to low hundreds of listings, so query cost is small today but should not grow with paging depth.

## Options considered

### Option 1: One server rendered page with URL state over the existing search (chosen)

The page reads the URL, runs a cached search on the server, and renders the first 24; small client components change the URL and fetch further pages through a public server action. Keyword matching is a simple rule (area name, code, or title contains); counts come from cached grouped queries.

**Pros**:
- Reuses spec 0002's search and its keyset paging; works without JavaScript for the first page and every filter link.
- Shareable, back button friendly, and cacheable per search under the `listings` tag.
- No new infrastructure.

**Cons**:
- Each filter change is a server round trip; on a slow connection that's slower than filtering in the browser.
- The keyword box won't find words that only appear in descriptions.

### Option 2: Load every published listing into the browser and filter there

Send all published listings (small today) to the page once and filter, sort, and count in the browser.

**Pros**:
- Instant filtering after the first load.

**Cons**:
- The first load grows with every listing; heavy on phones over mobile data.
- Search engines and shared links still need server rendering, so the logic exists twice.

### Option 3: A hosted search engine

Index listings in a hosted search service (full text, typo tolerance, facets out of the box).

**Pros**:
- Full text across descriptions, typo tolerance, fast facets.

**Cons**:
- A new vendor, keys, cost, and a sync job that must never drift from the database's status rules.
- Out of proportion for tens to hundreds of listings.

## Rationale

The agency's inventory is small and changes a few times a day, so the deciding forces are shareability, crawlability, phone performance, and not adding moving parts. URL state with server rendering gives shareable, crawlable searches for free and keeps the logic in one place; spec 0005's `listings` tag already invalidates cached results, so caching per search is safe. Loading everything into the browser would be faster after the first load but makes the first load grow with the business and still needs a server path for links and crawlers. A hosted engine solves problems the agency doesn't have yet (typo tolerant full text over thousands of homes) at the cost of a vendor and a sync that could show a sold home as available.

The keyword rule is deliberately narrow: buyers mostly type an area or a code they saw on WhatsApp, and treating an area name as an area filter gives correct results with counts, rather than fuzzy title matches. Descriptions stay out of keyword search; the assistant is the place for "rooftop garden near a school", which is why "Describe it instead" carries the filters into the chat. Lakh and crore presets match how buyers state budgets and keep the URL to a small set of values, which keeps cached searches few.

Indexing only the base page and single area pages gives search engines meaningful landing pages ("Homes for sale in Tilagor") without thousands of thin combinations competing with the property pages, which carry the long tail.

