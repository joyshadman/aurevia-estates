# 0012 · Property details page

**Status**: Assumed
**Date**: 2026-10-26
**Authorized by**: joyshadman, during /develop ("with recommended decision")

## Owed decision
The mockup (`desing-check/aurevia-estates/property.html`) fixes the look, but several parts had no source: the route and what non published listings do, the cache and SEO approach, the gallery behavior, what replaces the mockup's invented facts (title verified badge, area median comparison, advisor rating, phone and email, travel times to nearby places, extra spec rows), how "similar homes" are picked, and whether the page books viewings itself.

## Assumption built on
- **Route**: `/properties/[slug]` (the slug from spec 0002). Only `PUBLISHED` listings; any other status or an unknown slug shows the not found page. `generateStaticParams` prerenders the published slugs. Because Partial Prefetching is on (spec 0001), `params` is read inside Suspense, so the not found page streams with `noindex` and HTTP status 200, not 404 (Next 16, "Calling `notFound()` after streaming has started"). A true 404 status would need a slug check in `proxy.ts` or turning off Partial Prefetching, both project wide choices left to `/architect`.
- **Public and cached**: reads no cookies (root `AGENTS.md`). Its read is `"use cache"`, tagged `listing:<id>` and `listings` (cache life hours); spec 0005's agent actions already refresh both tags.
- **SEO and social cards**: `generateMetadata` gives the title (`<title> · <area>`), a description (the first 155 characters of the description), a canonical URL, and Open Graph and Twitter `summary_large_image` cards with the cover photo. Structured data waits for feature 16.
- **Header**: a breadcrumb (Home / Homes for sale / title), a type badge ("Villa · For sale"), the ref code, the title, the address line with area, the price (`formatPrice`), and price per sqft when built up sqft is set. A Share button uses the browser's share sheet, or copies the link. No Save (feature 14), no "Title verified", no median comparison.
- **Gallery**: the main photo plus a row of thumbnails (photos in `sort_order`, cover first). Clicking a thumbnail swaps the main photo; arrows and the photo count ("3 of 8") move through them. No lightbox. No photos: the framed house icon.
- **Body**:
  - Key facts by type (spec 0003's chip rules: beds, baths, built up sqft, land katha).
  - About (the description, line breaks kept).
  - Amenities (labels with a check).
  - Specifications: only stored fields, each row hidden when null: property type, completion status, handover date, floor (and total floors), parking spaces, built up area, land, ref code, listed on (`published_at`, Asia/Dhaka).
- **Around the address**: the area name, plus "Open in Google Maps" built from the stored latitude and longitude. No nearby places or travel times until feature 13.
- **Side card**: "Book a viewing" explains that viewings are booked in the chat (spec 0007), with the primary button "Chat about this home" → `/assistant?listing=<slug>` (spec 0006's start listing). It names the advisor with spec 0007's `advisorName()` (the public name, else "an Aurevia advisor"). No phone, email, photo, or rating.
- **"You may also consider"**: up to 3 other published listings of the same type or in the same area, closest in price first.
- **Links**: cards on `/properties` and the homepage, and the homepage hero card, now link to this page (spec 0010 and 0011 said feature 10 would add the link). Each card keeps its "Ask about this home" button.

## Code area
`app/properties/[slug]/`, `lib/server/listing-page.ts`, `app/properties/page.tsx`, `app/page.tsx`

## Requirements
- **AC-1**: each published listing has a page at `/properties/<slug>`; other statuses and unknown slugs show the not found page, marked `noindex`.
- **AC-2**: the page shows the gallery, price, key facts, description, amenities, stored specifications, location link, and up to 3 similar homes, only from stored data.
- **AC-3**: "Chat about this home" opens the assistant with that listing in context (after sign in).
- **AC-4**: the page has a unique title, description, canonical URL, and Open Graph and Twitter cards with the cover photo.
- **AC-5**: the page reads no cookies, is cached, and refreshes when the listing changes or is unpublished.
- **AC-6**: listing cards on `/properties` and the homepage link to it.
- **AC-7**: it works at phone width, in light and dark, and with the keyboard (WCAG 2.2 AA).

## Ratify
This decision was recorded by /develop, not deliberated. Run `/architect property details page` to deliberate and ratify it. Until then it stays flagged as an owed decision; it does not block marking the feature `done`.
