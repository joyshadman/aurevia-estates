import { beforeAll, describe, expect, it } from "vitest";
import { jsonLdString, listingJsonLd, organizationJsonLd } from "@/lib/domain/structured-data";
import type { Actor } from "@/lib/server/auth";
import { transitionListing } from "@/lib/server/listing-status";
import { getPublicListing } from "@/lib/server/public-listings";
import { sitemapData } from "@/lib/server/sitemap";
import { createArea, createListing, createProfile } from "./support/fixtures";

// Spec 0015 (assumed): sitemap, robots, structured data.

let agent: Actor;

beforeAll(async () => {
  ({ actor: agent } = await createProfile("AGENT"));
});

describe("the sitemap", () => {
  it("lists PUBLISHED listings and their areas only, never SOLD, UNPUBLISHED, or DRAFT", async () => {
    const live = await createArea();
    const empty = await createArea();
    const published = await createListing(agent, { publish: true, areaId: live.id });
    const sold = await createListing(agent, { publish: true, areaId: empty.id });
    await transitionListing(sold.id, "SOLD", agent);
    const hidden = await createListing(agent, { publish: true, areaId: empty.id });
    await transitionListing(hidden.id, "UNPUBLISHED", agent);
    const draft = await createListing(agent, { areaId: empty.id });

    const data = await sitemapData();
    const slugs = data.listings.map((l) => l.slug);
    expect(slugs).toContain(published.slug);
    for (const gone of [sold, hidden, draft]) expect(slugs).not.toContain(gone.slug);
    expect(data.listings.find((l) => l.slug === published.slug)).toMatchObject({ cover: expect.stringMatching(/^https:\/\//) });

    const areaSlugs = data.areas.map((a) => a.slug);
    expect(areaSlugs).toContain(live.slug);
    expect(areaSlugs).not.toContain(empty.slug);
  });
});

describe("structured data", () => {
  it("describes a published home with an offer in BDT and a breadcrumb", async () => {
    const home = await createListing(agent, { publish: true, title: "Hill view </script><b>flat", priceBdt: 12_000_000, bedrooms: 3, builtUpSqft: 1500 });
    const result = await getPublicListing(home.slug);
    const [listing, breadcrumb] = listingJsonLd(result!.listing, "https://aurevia.test");
    expect(listing).toMatchObject({
      "@type": "RealEstateListing",
      url: `https://aurevia.test/properties/${home.slug}`,
      offers: { "@type": "Offer", price: 12_000_000, priceCurrency: "BDT" },
      about: { "@type": "Apartment", numberOfBedrooms: 3, floorSize: { value: 1500, unitCode: "FTK" }, address: { addressRegion: "Sylhet", addressCountry: "BD" } },
    });
    expect(breadcrumb.itemListElement).toHaveLength(4);
    expect(breadcrumb.itemListElement[2]).toMatchObject({ position: 3, item: expect.stringContaining("/properties?area=") });

    // No listing text can close the script tag.
    const text = jsonLdString(listing);
    expect(text).not.toContain("</script>");
    expect(JSON.parse(text).name).toBe("Hill view </script><b>flat");
  });

  it("names plots as places without rooms, and the agency without invented details", () => {
    const [plot] = listingJsonLd(
      {
        slug: "plot",
        title: "Plot",
        description: "Land",
        propertyType: "PLOT",
        priceBdt: 1,
        publishedAt: null,
        area: { nameEn: "Tilagor", slug: "tilagor" },
        latitude: null,
        longitude: null,
        bedrooms: 2,
        bathrooms: null,
        builtUpSqft: 900,
        photos: [],
      },
      "https://aurevia.test",
    );
    expect(plot.about).toEqual({ "@type": "Place", name: "Plot", address: expect.any(Object) });
    expect(Object.keys(organizationJsonLd("https://aurevia.test")).sort()).toEqual(["@context", "@type", "areaServed", "name", "url"]);
  });
});
