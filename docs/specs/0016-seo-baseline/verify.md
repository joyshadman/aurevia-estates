# Verify: SEO baseline · spec 0016 · updated 2026-10-26
_Steps derived from spec 0016 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. The spec is `Assumed`._

## Commands
- [ ] `curl <site>/sitemap.xml` → `/`, `/properties`, `/about`, and one `/properties/<slug>` per published home, all absolute on `NEXT_PUBLIC_SITE_URL`, each listing with `lastmod` → AC-1
- [ ] Unpublish a home as an agent, fetch `/sitemap.xml` again → its URL is gone → AC-4
- [ ] `curl <site>/robots.txt` → `Allow: /`, `Disallow` for `/dashboard`, `/account`, `/assistant`, `/saved`, `/sign-in`, `/auth`, `/api`, `/styleguide`, and the `Sitemap:` line → AC-2
- [ ] View source on a property page → one `application/ld+json` `RealEstateListing` with name, description, url, images, datePosted, an `Offer` in BDT, and an `about` with address, geo, rooms, baths, and floor size where stored → AC-3
- [ ] Paste that page into Google's Rich Results Test (on a deployed build) → the structured data parses with no errors → AC-3
- [ ] A plot listing → `about` is a `Place` with no rooms or floor size → AC-3
- [ ] The homepage source → one `RealEstateAgent` with name and URL only → AC-3
- [ ] Production: `NEXT_PUBLIC_SITE_URL` is the real domain, so no URL says `localhost` → AC-1, AC-2

## Acceptance-criteria coverage
- AC-1: sitemap contents and absolute URLs
- AC-2: robots rules
- AC-3: listing and agency JSON-LD
- AC-4: unpublish drops from the sitemap
