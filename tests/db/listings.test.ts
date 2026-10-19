import { beforeAll, describe, expect, it } from "vitest";
import { listingInput } from "@/lib/domain/listing-schema";
import type { Actor } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { LastCoverError, PublishBlockedError } from "@/lib/server/errors";
import { nextListingRef, publishListing, searchPublishedListings } from "@/lib/server/listings";
import { deletePhoto, setCover } from "@/lib/server/photos";
import { createAmenity, createArea, createListing, createProfile, expectConstraint } from "./support/fixtures";

// Spec 0002: AC-3 (listing invariants), AC-4 (photos), AC-5 (type rules), AC-6 (search).

let agent: Actor;

beforeAll(async () => {
  ({ actor: agent } = await createProfile("AGENT"));
});

describe("AC-3: listing invariants", () => {
  it("creates, publishes, and finds a listing through the shared path", async () => {
    const area = await createArea();
    const listing = await createListing(agent, { areaId: area.id, publish: true });
    expect(listing.status).toBe("PUBLISHED");
    expect(listing.publishedAt).toBeInstanceOf(Date);
    expect(listing.refCode).toMatch(/^AUR-[0-9]{4,}$/);
    expect(listing.slug).toBe(`${listing.slug.split("-aur-")[0]}-${listing.refCode.toLowerCase()}`);

    const { items } = await searchPublishedListings({ areaIds: [area.id] });
    expect(items.map((i) => i.refCode)).toEqual([listing.refCode]);
    expect(typeof items[0].priceBdt).toBe("number");
  });

  it("hands out refs past the sample range", async () => {
    const { refCode, slug } = await nextListingRef("Lake view flat");
    expect(Number(refCode.slice(4))).toBeGreaterThan(1010);
    expect(slug).toBe(`lake-view-flat-${refCode.toLowerCase()}`);
  });

  it("rejects a bad ref code, a duplicate slug, and a zero price", async () => {
    const listing = await createListing(agent);
    await expectConstraint(
      db.listing.update({ where: { id: listing.id }, data: { refCode: "AUR-12" } }),
      "listings_ref_code_format_ck",
    );
    const other = await createListing(agent);
    await expectConstraint(db.listing.update({ where: { id: other.id }, data: { slug: listing.slug } }), "slug");
    await expectConstraint(
      db.listing.update({ where: { id: listing.id }, data: { priceBdt: BigInt(0) } }),
      "listings_price_positive_ck",
    );
  });

  it("rejects a PUBLISHED row without coordinates in SQL", async () => {
    const listing = await createListing(agent, { publish: true });
    await expectConstraint(
      db.listing.update({ where: { id: listing.id }, data: { latitude: null } }),
      "listings_published_complete_ck",
    );
  });

  it("blocks publishing without a cover photo or coordinates, and changes nothing", async () => {
    const listing = await createListing(agent, { latitude: null, longitude: null });
    const error = await publishListing(listing.id, agent).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PublishBlockedError);
    expect((error as PublishBlockedError).missing).toEqual(["cover photo", "map location"]);
    expect((await db.listing.findUniqueOrThrow({ where: { id: listing.id } })).status).toBe("DRAFT");
  });
});

describe("AC-4: photos", () => {
  it("rejects a photo with both a url and a storage path, and one with neither", async () => {
    const listing = await createListing(agent);
    const base = { listingId: listing.id, sortOrder: 0, alt: "x" };
    await expectConstraint(
      db.listingPhoto.create({ data: { ...base, url: "https://example.com/a.jpg", storagePath: "a/b.jpg" } }),
      "listing_photos_one_source_ck",
    );
    await expectConstraint(db.listingPhoto.create({ data: base }), "listing_photos_one_source_ck");
  });

  it("allows only one cover per listing", async () => {
    const listing = await createListing(agent, { withCover: true });
    await expectConstraint(
      db.listingPhoto.create({
        data: { listingId: listing.id, url: "https://example.com/b.jpg", sortOrder: 1, isCover: true, alt: "x" },
      }),
      "listing_photos_one_cover_uq",
    );
  });

  it("swaps the cover with setCover and keeps the last cover of a PUBLISHED listing", async () => {
    const listing = await createListing(agent, { publish: true });
    const [cover] = await db.listingPhoto.findMany({ where: { listingId: listing.id, isCover: true } });
    await expect(deletePhoto(cover.id, agent)).rejects.toBeInstanceOf(LastCoverError);

    const second = await db.listingPhoto.create({
      data: { listingId: listing.id, url: "https://example.com/c.jpg", sortOrder: 1, alt: "x" },
    });
    await setCover(second.id, agent);
    const covers = await db.listingPhoto.findMany({ where: { listingId: listing.id, isCover: true } });
    expect(covers.map((p) => p.id)).toEqual([second.id]);

    await deletePhoto(cover.id, agent);
    await expect(deletePhoto(second.id, agent)).rejects.toBeInstanceOf(LastCoverError);
  });

  it("lets only the owning agent change photos", async () => {
    const listing = await createListing(agent, { withCover: true });
    const [cover] = await db.listingPhoto.findMany({ where: { listingId: listing.id } });
    const { actor: otherAgent } = await createProfile("AGENT");
    await expect(deletePhoto(cover.id, otherAgent)).rejects.toThrow("Forbidden");
  });
});

describe("AC-5: type rules", () => {
  const base = {
    title: "Test",
    description: "Test",
    priceBdt: 1_000_000,
    areaId: "0199f000-0000-7000-8000-000000000001",
    addressLine: "Somewhere",
  };

  it("rejects a plot with bedrooms", () => {
    const result = listingInput.safeParse({ ...base, propertyType: "PLOT", landKatha: 5, bedrooms: 2 });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0])).toEqual(["bedrooms"]);
  });

  it("rejects an apartment without a floor number", () => {
    const result = listingInput.safeParse({
      ...base,
      propertyType: "APARTMENT",
      bedrooms: 3,
      bathrooms: 2,
      builtUpSqft: 1200,
      completionStatus: "READY",
    });
    expect(result.error?.issues.map((i) => i.path[0])).toEqual(["floorNumber"]);
  });

  it("accepts a valid plot", () => {
    expect(listingInput.safeParse({ ...base, propertyType: "PLOT", landKatha: 5.5 }).success).toBe(true);
  });
});

describe("AC-6: search", () => {
  let areaId: string;
  let both: string[];
  let pool: string;
  let lift: string;

  beforeAll(async () => {
    areaId = (await createArea()).id;
    pool = (await createAmenity()).id;
    lift = (await createAmenity()).id;
    both = [];
    // 30 published listings in one fresh area; every third has both amenities.
    for (let i = 0; i < 30; i++) {
      const amenityIds = i % 3 === 0 ? [pool, lift] : i % 3 === 1 ? [pool] : [];
      const listing = await createListing(agent, { areaId, amenityIds, priceBdt: 5_000_000 + i * 100_000, publish: true });
      if (i % 3 === 0) both.push(listing.refCode);
    }
  });

  it("pages through every listing exactly once", async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await searchPublishedListings({ areaIds: [areaId], limit: 12, cursor });
      seen.push(...page.items.map((i) => i.refCode));
      cursor = page.nextCursor ?? undefined;
      pages++;
    } while (cursor);
    expect(pages).toBe(3);
    expect(seen).toHaveLength(30);
    expect(new Set(seen).size).toBe(30);
  });

  it("requires every chosen amenity", async () => {
    const { items } = await searchPublishedListings({ areaIds: [areaId], amenityIds: [pool, lift], limit: 24 });
    expect(items.map((i) => i.refCode).sort()).toEqual([...both].sort());
  });

  it("treats price bounds as inclusive", async () => {
    const { items } = await searchPublishedListings({ areaIds: [areaId], minPrice: 5_000_000, maxPrice: 5_200_000 });
    expect(items.map((i) => i.priceBdt).sort()).toEqual([5_000_000, 5_100_000, 5_200_000]);
  });

  it("never matches a plot (null bedrooms) on a bedroom filter", async () => {
    const plot = await createListing(agent, {
      areaId,
      propertyType: "PLOT",
      landKatha: 4,
      bedrooms: null,
      bathrooms: null,
      builtUpSqft: null,
      floorNumber: null,
      completionStatus: null,
      publish: true,
    });
    const { items } = await searchPublishedListings({ areaIds: [areaId], minBedrooms: 0, limit: 24 });
    expect(items.map((i) => i.refCode)).not.toContain(plot.refCode);
  });

  it("leaves out listings that are not PUBLISHED", async () => {
    const draft = await createListing(agent, { areaId });
    const { items } = await searchPublishedListings({ areaIds: [areaId], limit: 24 });
    expect(items.map((i) => i.refCode)).not.toContain(draft.refCode);
  });

  it("rejects a bad cursor", async () => {
    await expect(searchPublishedListings({ cursor: "not-a-cursor" })).rejects.toThrow("Invalid cursor");
  });

  it("is backed by the search indexes", async () => {
    const indexes = await db.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE tablename = 'listings'`;
    const defs = indexes.map((i) => i.indexdef).join("\n");
    expect(defs).toContain("(status, published_at DESC, id DESC)");
    expect(defs).toContain("(status, area_id, price_bdt)");
    expect(defs).toContain("(status, property_type, bedrooms)");
  });
});
