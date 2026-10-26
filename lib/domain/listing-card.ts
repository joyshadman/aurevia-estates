import { normalizeBanglaDigits } from "@/lib/domain/bangla";

// The card shape every listing card renders (spec 0003). `toCardDTO` in
// `lib/server/listings.ts` maps `serializeListing` output to this type.

// "AUR-1042", "aur 1042", "১০৪২" all name AUR-1042. Shared by the assistant's
// tools and the lead inbox search (spec 0009, AC-4).
export function normalizeRefCode(input: string): string {
  const digits = normalizeBanglaDigits(input).match(/\d{4,}/)?.[0];
  return digits ? `AUR-${digits}` : input.trim().toUpperCase();
}

export const propertyTypes = ["APARTMENT", "DUPLEX", "VILLA", "HOUSE", "PLOT", "COMMERCIAL"] as const;
export type PropertyType = (typeof propertyTypes)[number];

export type ListingCardDTO = {
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
