import type { PropertyType } from "@/lib/domain/listing-card";

// What the property page renders (spec 0009). The public page and the agent
// preview both map their data to this shape; only the preview has empty fields.
export type PropertyViewModel = {
  mode: "public" | "preview";
  id: string;
  sold: boolean;
  status: string;
  slug: string;
  refCode: string;
  propertyType: PropertyType;
  title: string;
  description: string | null;
  priceBdt: number | null;
  priceNegotiable: boolean;
  pricePerSqft: number | null;
  areaName: string;
  areaSlug: string;
  addressLine: string | null;
  latitude: number | null;
  longitude: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  builtUpSqft: number | null;
  landKatha: number | null;
  floorNumber: number | null;
  totalFloors: number | null;
  parkingSpaces: number | null;
  completionStatus: "READY" | "UNDER_CONSTRUCTION" | null;
  handoverDate: string | null;
  amenities: { id: string; label: string }[];
  photos: { id: string; url: string; alt: string; width: number | null; height: number | null }[];
  advisor: { name: string; title: string | null; photoUrl: string | null; whatsapp: string | null } | null;
};

// The assistant entry points (AC-2, AC-3). `q` fills the composer, never sends.
export function assistantLinks(view: Pick<PropertyViewModel, "slug" | "refCode" | "title" | "areaName">) {
  const ask = new URLSearchParams({ listing: view.slug });
  const book = new URLSearchParams({ listing: view.slug, q: `I'd like to book a viewing of ${view.refCode}` });
  const similar = new URLSearchParams({ q: `Homes like ${view.title} in ${view.areaName}`.slice(0, 500) });
  return { ask: `/assistant?${ask}`, book: `/assistant?${book}`, similar: `/assistant?${similar}` };
}
