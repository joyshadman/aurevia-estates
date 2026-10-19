import { beforeAll, describe, expect, it } from "vitest";
import { parseSearchState, toFilters } from "@/lib/domain/search-params";
import { mapStyle, shortPrice, staticMapUrl } from "@/lib/maps";
import type { Actor } from "@/lib/server/auth";
import { getListingForEdit, saveListing } from "@/lib/server/agent-listings";
import { listingFacts } from "@/lib/server/assistant/tools";
import { db } from "@/lib/server/db";
import { transitionListing } from "@/lib/server/listing-status";
import { getPublicListing } from "@/lib/server/public-listings";
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

describe("AC-5, AC-6: nearby places", () => {
  const school = { name: "Blue Bird School", kind: "SCHOOL" as const, minutes: 5, mode: "WALK" as const };
  const clinic = { name: "Oasis Hospital", kind: "HEALTH" as const, minutes: 12, mode: "DRIVE" as const };
  const mosque = { name: "Shahjalal Dargah", kind: "MOSQUE" as const, minutes: 8, mode: "DRIVE" as const };

  async function tokenOf(id: string) {
    return (await db.listing.findUniqueOrThrow({ where: { id } })).updatedAt.toISOString();
  }

  it("saves, reorders, and replaces the set; the page reads them in order", async () => {
    // A PUBLISHED listing stays complete on every save, so it needs a full description.
    const home = await createListing(agent, { publish: true, description: "A bright family apartment with a south facing balcony, close to schools and the market." });
    let result = await saveListing({ id: home.id, expectedUpdatedAt: await tokenOf(home.id), fields: { nearbyPlaces: [school, clinic, mosque] } }, agent);
    expect(result).toMatchObject({ ok: true });
    result = await saveListing({ id: home.id, expectedUpdatedAt: await tokenOf(home.id), fields: { nearbyPlaces: [mosque, school, clinic] } }, agent);
    expect(result).toMatchObject({ ok: true });

    const page = await getPublicListing(home.slug);
    expect(page!.listing.nearbyPlaces).toEqual([mosque, school, clinic]);
    // AC-7: the assistant's facts carry the same list, labelled for the model.
    expect((await listingFacts(home.id))!.facts!.nearbyPlaces).toEqual([
      { name: mosque.name, kind: "Mosque", travel: "8 min drive" },
      { name: school.name, kind: "School", travel: "5 min walk" },
      { name: clinic.name, kind: "Hospital or clinic", travel: "12 min drive" },
    ]);
    expect((await getListingForEdit(home.id, agent))!.nearbyPlaces).toEqual([mosque, school, clinic]);

    // A save without places leaves them alone; an empty list clears them.
    await saveListing({ id: home.id, expectedUpdatedAt: await tokenOf(home.id), fields: { title: "Renamed home near the school" } }, agent);
    expect(await db.listingNearbyPlace.count({ where: { listingId: home.id } })).toBe(3);
    await saveListing({ id: home.id, expectedUpdatedAt: await tokenOf(home.id), fields: { nearbyPlaces: [] } }, agent);
    expect(await db.listingNearbyPlace.count({ where: { listingId: home.id } })).toBe(0);
  });

  it("refuses a 9th place, a repeated name, bad minutes, and a stale save, per row", async () => {
    const home = await createListing(agent);
    const token = await tokenOf(home.id);
    const nine = Array.from({ length: 9 }, (_, i) => ({ ...school, name: `School ${i}` }));
    expect(await saveListing({ id: home.id, expectedUpdatedAt: token, fields: { nearbyPlaces: nine } }, agent)).toMatchObject({
      ok: false,
      reason: "invalid",
      fieldErrors: { nearbyPlaces: expect.any(String) },
    });
    expect(
      await saveListing({ id: home.id, expectedUpdatedAt: token, fields: { nearbyPlaces: [school, { ...clinic, name: "blue bird school" }, { ...mosque, minutes: 121 }] } }, agent),
    ).toMatchObject({ ok: false, reason: "invalid", fieldErrors: { "nearbyPlaces.1.name": "Already listed", "nearbyPlaces.2.minutes": expect.any(String) } });

    expect(await saveListing({ id: home.id, expectedUpdatedAt: token, fields: { nearbyPlaces: [school] } }, agent)).toMatchObject({ ok: true });
    // The first token is now stale (spec 0005's conflict check covers places too).
    expect(await saveListing({ id: home.id, expectedUpdatedAt: token, fields: { nearbyPlaces: [clinic] } }, agent)).toMatchObject({ ok: false, reason: "stale" });

    // Another agent who can't edit this listing can't change its places.
    const { actor: other } = await createProfile("AGENT");
    const denied = await saveListing({ id: home.id, expectedUpdatedAt: await tokenOf(home.id), fields: { nearbyPlaces: [clinic] } }, other);
    expect(denied.ok).toBe(false);
    expect(await db.listingNearbyPlace.findMany({ where: { listingId: home.id }, select: { name: true } })).toEqual([{ name: school.name }]);
  });

  it("the database refuses a name over 80 characters and minutes out of range", async () => {
    const home = await createListing(agent);
    await expect(db.listingNearbyPlace.create({ data: { listingId: home.id, ...school, name: "x".repeat(81), sortOrder: 0 } })).rejects.toThrow();
    await expect(db.listingNearbyPlace.create({ data: { listingId: home.id, ...school, minutes: 0, sortOrder: 0 } })).rejects.toThrow();
  });
});
