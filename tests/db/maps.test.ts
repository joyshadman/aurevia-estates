import { beforeAll, describe, expect, it } from "vitest";
import { parseSearchState, toFilters } from "@/lib/domain/search-params";
import { mapStyle, shortPrice, staticMapUrl } from "@/lib/maps";
import type { Actor } from "@/lib/server/auth";
import { transitionListing } from "@/lib/server/listing-status";
import { searchMapPoints, searchRefs } from "@/lib/server/public-search";
import { createArea, createListing, createProfile } from "./support/fixtures";

// Spec 0011: map view.

let agent: Actor;

beforeAll(async () => {
  ({ actor: agent } = await createProfile("AGENT"));
});

describe("AC-1: the short price on pins", () => {
  it("shows whole lakh below a crore, else crore to one decimal", () => {
    expect(shortPrice(8_500_000)).toBe("৳ 85 L");
    expect(shortPrice(65_000_000)).toBe("৳ 6.5 Cr");
    expect(shortPrice(10_000_000)).toBe("৳ 1 Cr");
    // Rounded first: 99.5 lakh is a crore, 10.04 crore drops its ".0".
    expect(shortPrice(9_950_000)).toBe("৳ 1 Cr");
    expect(shortPrice(100_400_000)).toBe("৳ 10 Cr");
  });
});

describe("AC-1, AC-11: search map points", () => {
  it("returns PUBLISHED matches with coordinates, newest first, and follows status changes", async () => {
    const area = await createArea();
    const older = await createListing(agent, { publish: true, areaId: area.id, latitude: 24.91, longitude: 91.86 });
    const newer = await createListing(agent, { publish: true, areaId: area.id, latitude: 24.92, longitude: 91.87, priceBdt: 6_500_000 });
    await createListing(agent, { areaId: area.id });
    const refs = await searchRefs();
    const filters = toFilters(parseSearchState(new URLSearchParams(`area=${area.slug}&view=map&sort=price-asc`), refs), refs);

    const map = await searchMapPoints(filters);
    expect(map.total).toBe(2);
    expect(map.points.map((p) => p.slug)).toEqual([newer.slug, older.slug]);
    expect(map.points[0]).toMatchObject({ lat: 24.92, lng: 91.87, priceBdt: 6_500_000, areaName: area.nameEn });

    await transitionListing(older.id, "SOLD", agent);
    expect((await searchMapPoints(filters)).points.map((p) => p.slug)).toEqual([newer.slug]);
  });
});

describe("AC-4, AC-12: map URLs", () => {
  it("fills the committed style with the key, and builds the static map", () => {
    const style = mapStyle("k&y");
    expect(style.sources.openmaptiles.url).toBe("https://api.maptiler.com/tiles/v3/tiles.json?key=k%26y");
    expect(style.glyphs).toContain("{fontstack}/{range}.pbf?key=k%26y");
    expect(style.layers.length).toBeGreaterThan(5);
    const url = staticMapUrl("key", 24.9, 91.87);
    expect(url).toContain("/static/91.87,24.9,15/640x360@2x.png?key=key");
    expect(url).toContain(`markers=${encodeURIComponent("91.87,24.9,#853953")}`);
  });
});
