# 0023 · Paid featured listings (placeholder)

**Status**: Assumed
**Date**: 2026-10-26
**Authorized by**: joyshadman, during /develop: "for now payment not need only make dummy page for it"

## Owed decision
The payment gateway (spec 0001 leaves it open; SSLCommerz is the leading candidate, Stripe is not open to Bangladesh businesses), prices and periods, who pays (sellers come from slice 5, not built), and how featuring changes search and the homepage. **All of it stays owed.** This spec only records the placeholder.

## Assumption built on
- **A preview page only**: `/dashboard/featured`, agents only, labelled "Preview". It explains featuring, lists the agent's published listings to pick from, and shows three example periods (7, 14, 30 days) with "Price to be announced".
- **No payment and no writes**: the pay button is disabled and says "Payments are coming soon". Nothing is stored, no listing is featured, no gateway is called, no prices are invented.
- When the real feature is designed, this page is replaced, not extended.

## Code area
`app/dashboard/featured/page.tsx`, `app/dashboard/featured/feature-preview.tsx`, `app/dashboard/dashboard-nav.tsx`

## Requirements
- **AC-1**: An agent opens `/dashboard/featured` from the dashboard nav and sees the explanation, their published listings, and three example periods with no prices.
- **AC-2**: The pay button is disabled and nothing on the page writes data or calls a payment service.
- **AC-3**: A visitor opening it gets the same 404 as other dashboard pages.

## Ratify
This is a placeholder recorded by /develop. Run `/architect paid featured listings` once slice 5 (sellers) exists and you have a merchant account, to decide the gateway, prices, and behavior. Until then the feature stays `in-progress`.
