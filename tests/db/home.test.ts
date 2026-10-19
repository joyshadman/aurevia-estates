import { describe, expect, it } from "vitest";
import { db } from "@/lib/server/db";
import { homeData } from "@/lib/server/home";
import { transitionListing } from "@/lib/server/listing-status";
import { createListing, createProfile } from "./support/fixtures";

// Spec 0012 (assumed): the homepage's live data.

describe("homepage data", () => {
  it("shows the newest published homes, the total, and a tile per type with its lowest price", async () => {
    const { actor: agent } = await createProfile("AGENT");
    const before = await homeData();
    const cheapPlot = await createListing(agent, {
      publish: true,
      propertyType: "PLOT",
      priceBdt: 1_000_001,
      landKatha: 3,
      bedrooms: null,
      bathrooms: null,
      builtUpSqft: null,
      floorNumber: null,
      completionStatus: null,
    });
    const newest = await createListing(agent, { publish: true });
    await createListing(agent); // a draft never shows

    const after = await homeData();
    expect(after.newest).toHaveLength(3);
    expect(after.newest[0].slug).toBe(newest.slug);
    expect(after.newest[1].slug).toBe(cheapPlot.slug);
    expect(after.total).toBe(before.total + 2);
    const plot = after.types.find((t) => t.type === "PLOT");
    expect(plot?.fromPrice).toBe(1_000_001);
    expect(after.types.every((t) => t.count > 0)).toBe(true);

    await transitionListing(newest.id, "SOLD", agent);
    expect((await homeData()).newest.map((h) => h.slug)).not.toContain(newest.slug);
    expect(await db.listing.count({ where: { id: newest.id, status: "SOLD" } })).toBe(1);
  });
});
