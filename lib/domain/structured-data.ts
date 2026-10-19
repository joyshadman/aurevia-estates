import type { PropertyType } from "@/lib/domain/listing-card";

// JSON-LD builders (spec 0015, assumed). Pure, so tests and pages share them.

// `<` escaped so no listing text can close the script tag (Next.js JSON-LD guide).
export function jsonLdString(data: object): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

const homeTypes: Record<PropertyType, string> = {
  APARTMENT: "Apartment",
  DUPLEX: "SingleFamilyResidence",
  VILLA: "SingleFamilyResidence",
  HOUSE: "SingleFamilyResidence",
  PLOT: "Place",
  COMMERCIAL: "Place",
};

export type ListingForJsonLd = {
  slug: string;
  title: string;
  description: string;
  propertyType: PropertyType;
  priceBdt: number;
  publishedAt: string | null;
  area: { nameEn: string; slug: string };
  latitude: number | null;
  longitude: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  builtUpSqft: number | null;
  photos: { url: string }[];
};

export function listingJsonLd(listing: ListingForJsonLd, site: string) {
  const url = `${site}/properties/${listing.slug}`;
  const home: Record<string, unknown> = {
    "@type": homeTypes[listing.propertyType],
    name: listing.title,
    address: { "@type": "PostalAddress", addressLocality: listing.area.nameEn, addressRegion: "Sylhet", addressCountry: "BD" },
  };
  if (listing.latitude !== null && listing.longitude !== null) {
    home.geo = { "@type": "GeoCoordinates", latitude: listing.latitude, longitude: listing.longitude };
  }
  if (home["@type"] !== "Place") {
    if (listing.bedrooms !== null) home.numberOfBedrooms = listing.bedrooms;
    if (listing.bathrooms !== null) home.numberOfBathroomsTotal = listing.bathrooms;
    // FTK: square foot (UN/CEFACT).
    if (listing.builtUpSqft !== null) home.floorSize = { "@type": "QuantitativeValue", value: listing.builtUpSqft, unitCode: "FTK" };
  }
  const listingLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: listing.title,
    description: listing.description,
    url,
    image: listing.photos.slice(0, 10).map((p) => p.url),
    ...(listing.publishedAt ? { datePosted: listing.publishedAt } : {}),
    offers: { "@type": "Offer", price: listing.priceBdt, priceCurrency: "BDT", availability: "https://schema.org/InStock", url },
    about: home,
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { name: "Home", item: `${site}/` },
      { name: "Homes for sale", item: `${site}/properties` },
      { name: listing.area.nameEn, item: `${site}/properties?area=${listing.area.slug}` },
      { name: listing.title, item: url },
    ].map((crumb, i) => ({ "@type": "ListItem", position: i + 1, ...crumb })),
  };
  return [listingLd, breadcrumbLd] as const;
}

// Real data only (spec 0014): name, site, and where the agency works.
export function organizationJsonLd(site: string) {
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateAgent",
    name: "Aurevia Estates",
    url: `${site}/`,
    areaServed: { "@type": "City", name: "Sylhet", containedInPlace: { "@type": "Country", name: "Bangladesh" } },
  };
}
