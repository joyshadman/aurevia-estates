# Verify: SEO baseline · spec 0015 (assumed) · updated 2026-10-19
_Steps derived from the scope's Done when and spec 0015's assumption. `/check verify` runs these; `/test` locks the durable ones._

## Commands
- [ ] `npm run test:db` → `tests/db/seo.test.ts` passes (sitemap contents by status, listing JSON-LD, escaping, plots, the agency)
- [ ] `npm run build` → `/sitemap.xml` is dynamic (no database at build), `/robots.txt` is static

## UI / manual
- [ ] `/sitemap.xml` lists `/`, `/properties`, `/about`, one `/properties?area=<slug>` per area with a published home, and every PUBLISHED listing with its last change and cover → Done when
- [ ] Mark a listing sold or unpublish it → it leaves the sitemap on the next request; publish one → it appears → Done when
- [ ] `/robots.txt` allows `/`, disallows the signed in, agent, API, and styleguide paths, and names the sitemap at the production site URL → Done when
- [ ] On a Vercel preview deploy, `/robots.txt` disallows everything
- [ ] A published home's page passes Google's Rich Results Test and the Schema Markup Validator with `RealEstateListing` and `BreadcrumbList` → Done when
- [ ] A sold home's page has no JSON-LD; the homepage has one `RealEstateAgent` with no invented details
- [ ] Submit the sitemap in Google Search Console once the production domain is live
