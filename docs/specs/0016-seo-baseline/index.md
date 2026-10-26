# 0016 · SEO baseline

**Status**: Assumed
**Date**: 2026-10-26
**Authorized by**: joyshadman, during /develop ("use recommended")

## Owed decision
Which pages the sitemap lists, what robots rules block, and which structured data listings carry.

## Assumption built on
- **Sitemap** (`app/sitemap.ts`): `/`, `/properties`, `/about`, and `/properties/<slug>` for every published listing (with `lastModified` from the listing's `updated_at`). Absolute URLs from `NEXT_PUBLIC_SITE_URL`. Cached and tagged `listings`.
- **Robots** (`app/robots.ts`): allow everything except `/dashboard`, `/account`, `/assistant`, `/saved`, `/sign-in`, `/auth`, `/api`, `/styleguide`; point to the sitemap. Filtered discovery URLs stay crawlable (their canonical is the page itself).
- **Structured data**: each property page carries one JSON-LD `RealEstateListing` with `name`, `description`, `url`, `image` (all photos), `datePosted`, and an `offers` `Offer` (`price`, `priceCurrency` `BDT`, availability `InStock`), plus an `about` `SingleFamilyResidence` or `Apartment` with `numberOfRooms`, `numberOfBathroomsTotal`, `floorSize` (sqft), and an `address` (`streetAddress`, `addressLocality` area, `addressRegion` Sylhet, `addressCountry` BD) and `geo`. The homepage carries one `RealEstateAgent` with the name and URL only (no address until `lib/agency.ts` has one).
- Null fields are left out, never guessed.

## Code area
`app/sitemap.ts`, `app/robots.ts`, `app/properties/[slug]/page.tsx`, `app/page.tsx`, `lib/seo.ts`

## Requirements
- **AC-1**: `/sitemap.xml` lists every published listing and public page, with absolute URLs.
- **AC-2**: `/robots.txt` blocks the private areas and points to the sitemap.
- **AC-3**: each property page has valid `RealEstateListing` JSON-LD built only from stored data.
- **AC-4**: unpublishing a listing removes it from the sitemap on the next load.

## Ratify
This decision was recorded by /develop, not deliberated. Run `/architect SEO baseline` to deliberate and ratify it. Until then it stays flagged as an owed decision; it does not block marking the feature `done`.
