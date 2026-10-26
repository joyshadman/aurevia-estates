# 0013 · Map view

**Status**: Assumed
**Date**: 2026-10-26
**Authorized by**: joyshadman, during /develop ("use recommended")

## Owed decision
Which map library and tile provider to use, where the map appears in discovery, what a pin shows, and where "nearby places" on property pages come from.

## Assumption built on
- **Library and tiles**: Leaflet (`leaflet` 1.9, `react-leaflet` 5) with OpenStreetMap's standard tiles and their required attribution. No API key and no paid provider. Leaflet loads only in the browser (`next/dynamic` with `ssr: false`), so public pages stay cached and cookie free.
- **Discovery**: `/properties?view=map` (spec 0010's `view` param gains `map`; the nav's "Explore map" entry goes live). It keeps every filter and the sort, and shows all matches as pins (at most 300, no paging). A pin is a price pill (`formatPriceStep`). Clicking a pin opens a popup with the cover, title, area, price, and a link to `/properties/<slug>`. The map fits its bounds to the pins; with no pins it centres on Sylhet (24.8949, 91.8687).
- **Property page**: "Around the address" shows a small map centred on the listing's coordinates with one pin, plus the existing "Open in Google Maps" link.
- **Nearby places**: not shown. There is no data source for places or travel times, and inventing them would mislead. This part of the scope's "Done when" stays open for `/architect` (for example a curated list per area, or a places API).
- **Coordinates**: the stored `latitude` and `longitude` (spec 0005; required to publish).
- **Dark mode**: the map tiles stay light (OpenStreetMap has no dark tiles); pins and popups use role tokens.

## Code area
`components/map/` (`listing-map.tsx`, `leaflet-map.tsx`), `app/properties/page.tsx` (`MapResults`), `app/properties/[slug]/page.tsx`, `lib/server/discovery.ts` (`discoverMapPins`), `lib/domain/discovery.ts`, `app/globals.css` (Leaflet overrides), `lib/nav.ts`, `package.json`

## Requirements
- **AC-1**: `/properties?view=map` shows a pin for every listing matching the filters, and the URL keeps the filters.
- **AC-2**: a pin's popup links to the listing page.
- **AC-3**: each property page shows its location on a map.
- **AC-4**: tiles carry OpenStreetMap attribution; no API key is needed.
- **AC-5**: the map works with keyboard (Leaflet's own controls and markers) and at phone width.

## Ratify
This decision was recorded by /develop, not deliberated. Run `/architect map view` to deliberate and ratify it (and to decide a source for nearby places). Until then it stays flagged as an owed decision; it does not block marking the feature `done`.
