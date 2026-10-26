import type { PropertyType } from "@/lib/domain/listing-card";
import { publicEnv } from "@/lib/env";

// Search engine helpers (spec 0016). Absolute URLs come from the canonical
// origin, never the request host (spec 0008, AC-11). Structured data uses only
// stored fields; a null is left out, never guessed.

export const absoluteUrl = (path: string) => new URL(path, publicEnv().NEXT_PUBLIC_SITE_URL).toString();

// The page paths robots keep out of search (spec 0016, AC-2).
export const privatePaths = ["/dashboard", "/account", "/assistant", "/saved", "/sign-in", "/auth", "/api", "/styleguide"];

type JsonLd = Record<string, unknown>;

// `<` is escaped so a value can never close the script tag.
export const jsonLdHtml = (data: JsonLd) => JSON.stringify(data).replace(/</g, "\\u003c");

const residenceType: Record<PropertyType, string | null> = {
  APARTMENT: "Apartment",
  DUPLEX: "House",
  VILLA: "SingleFamilyResidence",
  HOUSE: "SingleFamilyResidence",
  PLOT: null,
  COMMERCIAL: null,
};

const compact = (data: JsonLd): JsonLd =>
  Object.fromEntries(Object.entries(data).filter(([, value]) => value !== null && value !== undefined));

type ListingForJsonLd = {
  title: string;
  description: string;
  propertyType: PropertyType;
  priceBdt: number;
  addressLine: string;
  area: { nameEn: string };
  latitude: number | null;
  longitude: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  builtUpSqft: number | null;
  publishedAt: string | null;
  photos: { url: string }[];
};

// AC-3: one `RealEstateListing` per property page.
export function listingJsonLd(listing: ListingForJsonLd, path: string): JsonLd {
  const type = residenceType[listing.propertyType];
  const address = {
    "@type": "PostalAddress",
    streetAddress: listing.addressLine,
    addressLocality: listing.area.nameEn,
    addressRegion: "Sylhet",
    addressCountry: "BD",
  };
  const geo =
    listing.latitude !== null && listing.longitude !== null
      ? { "@type": "GeoCoordinates", latitude: listing.latitude, longitude: listing.longitude }
      : null;
  return compact({
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: listing.title,
    description: listing.description,
    url: absoluteUrl(path),
    // Spec 0020: uploaded photo paths are relative.
    image: listing.photos.length > 0 ? listing.photos.map((photo) => absoluteUrl(photo.url)) : null,
    datePosted: listing.publishedAt,
    offers: { "@type": "Offer", price: listing.priceBdt, priceCurrency: "BDT", availability: "https://schema.org/InStock" },
    about: compact({
      "@type": type ?? "Place",
      address,
      geo,
      numberOfRooms: type ? listing.bedrooms : null,
      numberOfBathroomsTotal: type ? listing.bathrooms : null,
      floorSize: type && listing.builtUpSqft !== null ? { "@type": "QuantitativeValue", value: listing.builtUpSqft, unitCode: "FTK" } : null,
    }),
  });
}

// The homepage's agency entry: name and URL only until `lib/agency.ts` has an address.
export function agencyJsonLd(): JsonLd {
  return { "@context": "https://schema.org", "@type": "RealEstateAgent", name: "Aurevia Estates", url: absoluteUrl("/") };
}
