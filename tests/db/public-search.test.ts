import { beforeAll, describe, expect, it } from "vitest";
import {
  chipsFor,
  filtersSentence,
  parseSearchState,
  searchHref,
  serializeSearchState,
  sorts,
  toFilters,
  type SearchRefs,
} from "@/lib/domain/search-params";
import type { Actor } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { transitionListing } from "@/lib/server/listing-status";
import { countListings, searchFacets, searchListings, searchRefs } from "@/lib/server/public-search";
import { createAmenity, createListing, createProfile } from "./support/fixtures";

// Spec 0010: property search and filters.

const tag = Date.now().toString(36);
let agent: Actor;
let refs: SearchRefs;
let area: { id: string; slug: string; nameEn: string; nameBn: string };
let other: { id: string; slug: string; nameEn: string; nameBn: string };

beforeAll(async () => {
  ({ actor: agent } = await createProfile("AGENT"));
  area = await db.area.create({
    data: { slug: `t-search-${tag}`, nameEn: `Searchtown ${tag}`, nameBn: `সার্চ${tag}`, centerLat: 22.5, centerLng: 89.1, sortOrder: 970 },
  });
  other = await db.area.create({
    data: { slug: `t-search-other-${tag}`, nameEn: `Otherton ${tag}`, nameBn: `অন্য${tag}`, centerLat: 22.6, centerLng: 89.2, sortOrder: 971 },
  });
  refs = await searchRefs();
});

const parse = (query: string) => parseSearchState(new URLSearchParams(query), refs);

describe("AC-2, AC-4: the URL", () => {
  it("keeps valid values, drops invalid ones, and writes one canonical form", () => {
    const state = parse(`type=VILLA&type=apartment&type=castle&area=${area.slug}&area=nowhere&min=5000000&max=2500000&beds=9&sort=random&view=list&min=abc`);
    expect(state).toMatchObject({ types: ["apartment", "villa"], areas: [area.slug], min: 5_000_000, max: null, beds: null, sort: "newest", view: "list" });
    expect(serializeSearchState(state)).toBe(`area=${area.slug}&type=apartment&type=villa&min=5000000&view=list`);
    expect(searchHref(parse(""))).toBe("/properties");
    expect(parse("min=1234").min).toBeNull();
  });

  it("labels chips and builds the assistant sentence", () => {
    const amenity = refs.amenities[0];
    const state = parse(`area=${area.slug}&type=apartment&min=5000000&max=15000000&beds=3&amenity=${amenity.slug}`);
    expect(chipsFor(state, refs).map((c) => c.label)).toEqual([area.nameEn, "Apartment", "50 lakh to 1.5 crore", "3+ beds", amenity.label]);
    expect(filtersSentence(state, refs)).toBe(
      `I'm looking for a 3+ bedroom apartment, in ${area.nameEn}, between BDT 50 lakh and 1.5 crore, with ${amenity.label.toLowerCase()}.`,
    );
    expect(filtersSentence(parse(""), refs)).toBe("I'm looking for a home, in Sylhet.");
    expect(chipsFor(parse("max=10000000"), refs)[0].label).toBe("Up to 1 crore");
  });
});

describe("AC-1, AC-3: results and the keyword", () => {
  it("shows PUBLISHED only, by area name (English or Bangla), code, or title", async () => {
    const a = await createListing(agent, { publish: true, areaId: area.id, title: `Garden flat ${tag}`, builtUpSqft: 1000, priceBdt: 9_000_000 });
    await createListing(agent, { areaId: area.id, title: `Garden draft ${tag}` });
    const sold = await createListing(agent, { publish: true, areaId: area.id, title: `Garden sold ${tag}` });
    await transitionListing(sold.id, "SOLD", agent);

    for (const q of [area.nameEn.toUpperCase(), area.nameBn, area.slug]) {
      const filters = toFilters(parse(`q=${encodeURIComponent(q)}`), refs);
      expect(filters.areaIds).toEqual([area.id]);
      expect(filters.titleQuery).toBeNull();
    }
    const byTitle = await searchListings(toFilters(parse(`q=${encodeURIComponent(`garden flat ${tag}`)}`), refs));
    expect(byTitle.items.map((i) => i.slug)).toEqual([a.slug]);
    expect(byTitle.items[0].pricePerSqft).toBe(9000);

    const byCode = toFilters(parse(`q=${a.refCode.toLowerCase()}`), refs);
    expect(byCode.refCode).toBe(a.refCode);
    expect(await countListings(byCode)).toBe(1);
    // A code combines with the other filters.
    expect(await countListings(toFilters(parse(`q=${a.refCode}&type=plot`), refs))).toBe(0);
    // `%` is literal, not a wildcard.
    expect(await countListings(toFilters(parse("q=%25"), refs))).toBe(0);
    expect(await countListings(toFilters(parse("q=_"), refs))).toBe(0);
  });

  it("filters by price, minimum bedrooms (plots drop out), and every chosen amenity", async () => {
    const lift = await createAmenity();
    const pool = await createAmenity();
    const both = await createListing(agent, { publish: true, areaId: other.id, priceBdt: 15_000_000, bedrooms: 4, amenityIds: [lift.id, pool.id] });
    await createListing(agent, { publish: true, areaId: other.id, priceBdt: 15_000_000, bedrooms: 4, amenityIds: [lift.id] });
    await createListing(agent, {
      publish: true,
      areaId: other.id,
      propertyType: "PLOT",
      priceBdt: 15_000_000,
      landKatha: 5,
      bedrooms: null,
      bathrooms: null,
      builtUpSqft: null,
      floorNumber: null,
      completionStatus: null,
    });
    const fresh = await searchRefs();
    const filters = toFilters(parseSearchState(new URLSearchParams(`area=${other.slug}&min=10000000&max=20000000&beds=3&amenity=${lift.slug}&amenity=${pool.slug}`), fresh), fresh);
    const result = await searchListings(filters);
    expect(result.items.map((i) => i.slug)).toEqual([both.slug]);
    expect(await countListings(toFilters(parseSearchState(new URLSearchParams(`area=${other.slug}&beds=1`), fresh), fresh))).toBe(2);
  });
});

describe("AC-5, AC-6: sorting and paging", () => {
  it("never repeats or skips a home, in every sort, with duplicate prices", async () => {
    const pager = await db.area.create({
      data: { slug: `t-pager-${tag}`, nameEn: `Pager ${tag}`, nameBn: `পেজার${tag}`, centerLat: 21.5, centerLng: 89.3, sortOrder: 972 },
    });
    const ids: string[] = [];
    for (let i = 0; i < 60; i++) ids.push((await createListing(agent, { publish: true, areaId: pager.id, priceBdt: 5_000_000 + (i % 7) * 100_000 })).id);
    const fresh = await searchRefs();
    for (const sort of sorts) {
      const filters = toFilters(parseSearchState(new URLSearchParams(`area=${pager.slug}&sort=${sort}`), fresh), fresh);
      const seen: string[] = [];
      const prices: number[] = [];
      let cursor: string | undefined;
      do {
        const page = await searchListings(filters, cursor);
        seen.push(...page.items.map((i) => i.slug));
        prices.push(...page.items.map((i) => i.priceBdt));
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      expect(seen).toHaveLength(60);
      expect(new Set(seen).size).toBe(60);
      if (sort === "price-asc") expect(prices).toEqual([...prices].sort((x, y) => x - y));
      if (sort === "price-desc") expect(prices).toEqual([...prices].sort((x, y) => y - x));
    }
    // A cursor from another sort starts again at the top.
    const newest = toFilters(parseSearchState(new URLSearchParams(`area=${pager.slug}`), fresh), fresh);
    const firstPage = await searchListings(newest);
    const asc = { ...newest, sort: "price-asc" as const };
    expect((await searchListings(asc, firstPage.nextCursor!)).items[0].slug).toBe((await searchListings(asc)).items[0].slug);
  });
});

describe("AC-7, AC-14: counts and freshness", () => {
  it("counts per area and type ignore their own filter, and follow status changes", async () => {
    const counted = await db.area.create({
      data: { slug: `t-count-${tag}`, nameEn: `Count ${tag}`, nameBn: `গণনা${tag}`, centerLat: 21.4, centerLng: 89.4, sortOrder: 973 },
    });
    const a = await createListing(agent, { publish: true, areaId: counted.id });
    await createListing(agent, { publish: true, areaId: counted.id });
    const fresh = await searchRefs();
    const filters = toFilters(parseSearchState(new URLSearchParams(`area=${counted.slug}&type=villa`), fresh), fresh);
    const facets = await searchFacets(filters);
    // Type counts ignore the type filter: both apartments in the area count.
    expect(facets.types.APARTMENT).toBe(2);
    expect(facets.types.VILLA).toBe(0);
    // Area counts ignore the area filter but keep the villa type: none here.
    expect(facets.areas[counted.id] ?? 0).toBe(0);

    await transitionListing(a.id, "UNPUBLISHED", agent);
    const apartments = toFilters(parseSearchState(new URLSearchParams(`area=${counted.slug}`), fresh), fresh);
    expect(await countListings(apartments)).toBe(1);
  });
});
