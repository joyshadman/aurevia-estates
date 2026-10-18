import { z } from "zod";
import { propertyTypes, type PropertyType } from "@/lib/domain/listing-card";

// The shared listing input schema (spec 0002, AC-5). The listing form, the seed,
// and `publishListing` all apply the same type rules.

export const typeFields = ["bedrooms", "bathrooms", "builtUpSqft", "landKatha", "floorNumber", "completionStatus"] as const;
export type TypeField = (typeof typeFields)[number];

// Spec 0002 "Key invariants": what each property type must have and must leave empty.
export const typeRules: Record<PropertyType, { required: TypeField[]; empty: TypeField[] }> = {
  APARTMENT: {
    required: ["bedrooms", "bathrooms", "builtUpSqft", "floorNumber", "completionStatus"],
    empty: ["landKatha"],
  },
  DUPLEX: { required: ["bedrooms", "bathrooms", "builtUpSqft", "landKatha", "completionStatus"], empty: [] },
  VILLA: { required: ["bedrooms", "bathrooms", "builtUpSqft", "landKatha", "completionStatus"], empty: [] },
  HOUSE: { required: ["bedrooms", "bathrooms", "builtUpSqft", "landKatha", "completionStatus"], empty: [] },
  PLOT: {
    required: ["landKatha"],
    empty: ["bedrooms", "bathrooms", "builtUpSqft", "floorNumber", "completionStatus"],
  },
  COMMERCIAL: { required: ["builtUpSqft", "completionStatus"], empty: ["bedrooms"] },
};

type TypeFieldValues = Partial<Record<TypeField, unknown>> & {
  completionStatus?: unknown;
  handoverDate?: unknown;
};

const isSet = (value: unknown) => value !== null && value !== undefined;

// Every rule the values break, as `{ field, message }`. Shared by the Zod schema
// and `publishListing` (which reads the stored row).
export function typeRuleIssues(type: PropertyType, values: TypeFieldValues) {
  const issues: { field: TypeField | "handoverDate"; message: string }[] = [];
  const rules = typeRules[type];
  for (const field of rules.required) {
    if (!isSet(values[field])) issues.push({ field, message: `Required for ${type.toLowerCase()}` });
  }
  for (const field of rules.empty) {
    if (isSet(values[field])) issues.push({ field, message: `Does not apply to ${type.toLowerCase()}` });
  }
  if (isSet(values.handoverDate) && values.completionStatus !== "UNDER_CONSTRUCTION") {
    issues.push({ field: "handoverDate", message: "Only for homes under construction" });
  }
  return issues;
}

const count = z.number().int().min(0).max(1000);

export const listingInput = z
  .object({
    propertyType: z.enum(propertyTypes),
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(5000),
    priceBdt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    priceNegotiable: z.boolean().default(false),
    areaId: z.uuid(),
    addressLine: z.string().trim().min(1).max(200),
    latitude: z.number().min(-90).max(90).nullish(),
    longitude: z.number().min(-180).max(180).nullish(),
    bedrooms: count.nullish(),
    bathrooms: count.nullish(),
    builtUpSqft: z.number().int().positive().max(10_000_000).nullish(),
    landKatha: z
      .number()
      .positive()
      .max(99_999.99)
      .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, { message: "At most two decimal places" })
      .nullish(),
    floorNumber: z.number().int().min(-5).max(200).nullish(),
    totalFloors: z.number().int().min(1).max(200).nullish(),
    parkingSpaces: count.nullish(),
    completionStatus: z.enum(["READY", "UNDER_CONSTRUCTION"]).nullish(),
    handoverDate: z.iso.date().nullish(),
    amenityIds: z.array(z.uuid()).max(50).default([]),
  })
  .superRefine((value, ctx) => {
    for (const issue of typeRuleIssues(value.propertyType, value)) {
      ctx.addIssue({ code: "custom", path: [issue.field], message: issue.message });
    }
    if (isSet(value.latitude) !== isSet(value.longitude)) {
      ctx.addIssue({ code: "custom", path: ["longitude"], message: "Set both coordinates or neither" });
    }
  });

export type ListingInput = z.infer<typeof listingInput>;
