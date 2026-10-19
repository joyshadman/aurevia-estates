// The card shape every listing card renders (spec 0003). `toCardDTO` in
// `lib/server/listings.ts` maps `serializeListing` output to this type.

export const propertyTypes = ["APARTMENT", "DUPLEX", "VILLA", "HOUSE", "PLOT", "COMMERCIAL"] as const;
export type PropertyType = (typeof propertyTypes)[number];

export type ListingCardDTO = {
  // For the save heart (spec 0013).
  id: string;
  slug: string;
  refCode: string;
  title: string;
  areaName: string;
  propertyType: PropertyType;
  priceBdt: number;
  priceNegotiable: boolean;
  bedrooms: number | null;
  bathrooms: number | null;
  builtUpSqft: number | null;
  landKatha: number | null;
  cover: { url: string; alt: string } | null;
};

export const propertyTypeLabels: Record<PropertyType, string> = {
  APARTMENT: "Apartment",
  DUPLEX: "Duplex",
  VILLA: "Villa",
  HOUSE: "House",
  PLOT: "Plot",
  COMMERCIAL: "Commercial",
};
