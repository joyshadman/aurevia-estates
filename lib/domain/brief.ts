import type { PropertyType } from "@/lib/domain/listing-card";

// A conversation's search brief (spec 0006) in plain values: money in whole
// taka as numbers, ids as strings. `updatedAt` is the brief version that Show
// more compares against; null until the brief is first saved.
export type Brief = {
  budgetMinBdt: number | null;
  budgetMaxBdt: number | null;
  propertyTypes: PropertyType[];
  areaIds: string[];
  amenityIds: string[];
  minBedrooms: number | null;
  minBathrooms: number | null;
  familySize: number | null;
  notes: string | null;
  updatedAt: string | null;
};

export const emptyBrief: Brief = {
  budgetMinBdt: null,
  budgetMaxBdt: null,
  propertyTypes: [],
  areaIds: [],
  amenityIds: [],
  minBedrooms: null,
  minBathrooms: null,
  familySize: null,
  notes: null,
  updatedAt: null,
};
