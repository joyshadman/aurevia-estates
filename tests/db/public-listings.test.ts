import { beforeAll, describe, expect, it } from "vitest";
import { assistantLinks } from "@/components/property/view-model";
import type { Actor } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { transitionListing } from "@/lib/server/listing-status";
import { getListingPreview, getPublicListing, getSimilarListings } from "@/lib/server/public-listings";
import { createListing, createProfile } from "./support/fixtures";

// Spec 0009: the property page's reads.

let agent: Actor;
const tag = Date.now().toString(36);

async function areaAt(name: string, lat: number) {
  return db.area.create({
    data: { slug: `t-prop-${name}-${tag}`, nameEn: `Prop ${name}`, nameBn: name, centerLat: lat, centerLng: 88.9, sortOrder: 960 },
  });
}

beforeAll(async () => {
  ({ actor: agent } = await createProfile("AGENT", { fullName: "Nadia Rahman" }));
});

describe("AC-1, AC-3, AC-4, AC-6: getPublicListing", () => {
  it("returns a published listing with price per sqft, cover first, and named alt text", async () => {
    const listing = await createListing(agent, { publish: true, builtUpSqft: 1000, priceBdt: 9_500_000 });
    await db.listingPhoto.create({ data: { listingId: listing.id, url: "https://images.unsplash.com/a", sortOrder: -1, alt: " " } });
    const result = await getPublicListing(listing.slug);
    expect(result?.status).toBe("PUBLISHED");
    expect(result?.listing.pricePerSqft).toBe(9500);
    // The cover stays first even though another photo sorts before it.
    expect(result?.listing.photos[0].isCover).toBe(true);
    expect(result?.listing.photos[1].alt).toBe(`${listing.title}, photo 2`);
  });

  it("names a public agent only, with WhatsApp digits", async () => {
    const { actor: shy } = await createProfile("AGENT", { fullName: "Shy Agent" });
    const hidden = await createListing(shy, { publish: true });
    expect((await getPublicListing(hidden.slug))?.listing.advisor).toBeNull();

    await db.profile.update({ where: { id: shy.id }, data: { agentIsPublic: true, agentTitle: "Advisor", agentWhatsapp: "+880 1711-204 580" } });
    expect((await getPublicListing(hidden.slug))?.listing.advisor).toEqual({
      name: "Shy Agent",
      title: "Advisor",
      photoUrl: null,
      whatsapp: "8801711204580",
    });
  });

  it("shows sold homes, hides drafts, unpublished homes, and unknown slugs", async () => {
    const listing = await createListing(agent, { publish: true });
    await transitionListing(listing.id, "SOLD", agent);
    expect((await getPublicListing(listing.slug))?.status).toBe("SOLD");

    const draft = await createListing(agent);
    expect(await getPublicListing(draft.slug)).toBeNull();
    const off = await createListing(agent, { publish: true });
    await transitionListing(off.id, "UNPUBLISHED", agent);
    expect(await getPublicListing(off.slug)).toBeNull();
    expect(await getPublicListing("no-such-home")).toBeNull();
  });
});

describe("AC-5: similar homes", () => {
  it("ranks same area, then within 3 km, then the rest, by closest price, never outside 25%", async () => {
    const home = await areaAt("home", 23.0);
    const near = await areaAt("near", 23.01);
    const far = await areaAt("far", 23.5);
    const opts = (areaId: string, priceBdt: number) => ({ publish: true, areaId, priceBdt, latitude: 23, longitude: 88.9 });
    const self = await createListing(agent, opts(home.id, 10_000_000));
    const farClose = await createListing(agent, opts(far.id, 10_000_000));
    const nearOne = await createListing(agent, opts(near.id, 11_000_000));
    const sameArea = await createListing(agent, opts(home.id, 12_000_000));
    await createListing(agent, opts(home.id, 13_000_000)); // 30% more: out
    await createListing(agent, { ...opts(home.id, 10_000_000), publish: false }); // draft: out

    const similar = await getSimilarListings(self.id, "APARTMENT", home.id, 10_000_000);
    const order = similar.map((s) => s.refCode).filter((code) => [sameArea, nearOne, farClose].some((l) => l.refCode === code));
    expect(order).toEqual([sameArea.refCode, nearOne.refCode, farClose.refCode]);
    expect(similar.map((s) => s.slug)).not.toContain(self.slug);
  });
});

describe("AC-10: agent preview", () => {
  it("maps a draft with empty fields instead of failing", async () => {
    const draft = await createListing(agent);
    await db.listing.update({ where: { id: draft.id }, data: { priceBdt: null, description: null, addressLine: null } });
    const preview = await getListingPreview(draft.id);
    expect(preview).toMatchObject({ status: "DRAFT", priceBdt: null, description: null, pricePerSqft: null });
    expect(await getListingPreview("not-a-uuid")).toBeNull();
  });
});

describe("AC-2, AC-3: assistant links", () => {
  it("opens the chat with the listing, a prefilled booking line, or a similar homes brief", () => {
    const links = assistantLinks({ slug: "villa-aur-1001", refCode: "AUR-1001", title: "The Villa", areaName: "Tilagor" });
    expect(links.ask).toBe("/assistant?listing=villa-aur-1001");
    expect(new URLSearchParams(links.book.split("?")[1]).get("q")).toBe("I'd like to book a viewing of AUR-1001");
    expect(new URLSearchParams(links.similar.split("?")[1]).get("q")).toBe("Homes like The Villa in Tilagor");
  });
});
