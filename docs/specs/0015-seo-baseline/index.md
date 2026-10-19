# 0015 · SEO baseline

**Status**: Assumed
**Date**: 2026-10-19
**Authorized by**: Joy Shadmane, during /develop

## Owed decision
The sitemap's contents and freshness, the robots rules, and which structured data the pages carry. Specs 0005, 0009, and 0010 already fix which pages are indexable: PUBLISHED listing pages (SOLD ones are `noindex`), `/properties`, and a single area alone (`/properties?area=<slug>`).

## Assumption built on
- **Sitemap** (`/sitemap.xml`, `app/sitemap.ts`): `/`, `/properties`, `/about`; `/properties?area=<slug>` for each area with at least one PUBLISHED listing; and every PUBLISHED listing's page with `lastModified` from `updated_at` and its cover as the image. SOLD, UNPUBLISHED, and DRAFT listings never appear. The data is cached under the `listings` tag (spec 0005 updates it on every public change) with `cacheLife("hours")`, read at request time after `connection()`, so the build never needs the database (as the homepage, spec 0012). One file is enough below 50,000 URLs; split with `generateSitemaps` past that.
- **Robots** (`app/robots.ts`): allow `/`; disallow `/account`, `/saved`, `/assistant`, `/dashboard`, `/sign-in`, `/mfa`, `/auth`, `/api`, `/styleguide`; point to the sitemap at `NEXT_PUBLIC_SITE_URL`. A Vercel preview or development deploy (`VERCEL_ENV` other than `production`) disallows everything.
- **Structured data** (JSON-LD, rendered in the page as the Next.js guide recommends, with `<` escaped):
  - PUBLISHED listing pages: `RealEstateListing` (name, description, url, images, `datePosted`, an `Offer` in BDT with InStock) about the home (`Apartment`; `SingleFamilyResidence` for house, duplex, villa; `Place` for plot and commercial) with its locality, region Sylhet, country BD, coordinates, rooms, and floor size in square feet. Plus a `BreadcrumbList`: Home, Homes for sale, the area, the home. SOLD pages carry none.
  - The homepage: one `RealEstateAgent` with the name, the site URL, and `areaServed` Sylhet. Real data only (spec 0014): no address, phone, or ratings until the agency supplies them.

## Code area
`app/sitemap.ts`, `app/robots.ts`, `lib/server/sitemap.ts`, `lib/domain/structured-data.ts`, `components/seo/json-ld.tsx`, `app/properties/[slug]/page.tsx`, `app/page.tsx`, `lib/server/env.ts`, `tests/db/seo.test.ts`

## Requirements
- A sitemap lists every published listing and public page, robots rules are set, and listings carry structured data (scope, Done when).

## Ratify
This decision was recorded by /develop, not deliberated. Run `/architect SEO baseline`
to deliberate and ratify it. Until then it stays flagged as an owed decision; it does not block marking the feature `done`.
