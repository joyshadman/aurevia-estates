import { z } from "zod";
import { propertyTypes, type PropertyType } from "@/lib/domain/listing-card";
import { inBangladesh } from "@/lib/domain/location";

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

// Every rule the values break, as `{ field, kind, message }`. Shared by the Zod
// schemas and `publishListing` (which reads the stored row). `kind` lets a draft
// (spec 0005) skip the required fields while keeping the others.
export function typeRuleIssues(type: PropertyType, values: TypeFieldValues) {
  const issues: { field: TypeField | "handoverDate"; kind: "required" | "empty" | "handover"; message: string }[] = [];
  const rules = typeRules[type];
  for (const field of rules.required) {
    if (!isSet(values[field])) issues.push({ field, kind: "required", message: `Required for ${type.toLowerCase()}` });
  }
  for (const field of rules.empty) {
    if (isSet(values[field])) issues.push({ field, kind: "empty", message: `Does not apply to ${type.toLowerCase()}` });
  }
  if (isSet(values.handoverDate) && values.completionStatus !== "UNDER_CONSTRUCTION") {
    issues.push({ field: "handoverDate", kind: "handover", message: "Only for homes under construction" });
  }
  return issues;
}

const count = z.number().int().min(0).max(1000);

// Spec 0005: price 1 to 10,000,000,000 taka (AC-6); description up to 3,000
// characters, 50 or more to publish (AC-14).
export const maxPriceBdt = 10_000_000_000;
export const descriptionMax = 3000;
export const descriptionPublishMin = 50;

// Each field's own rule. The full and draft schemas below add the cross field rules.
export const listingFields = z.object({
  propertyType: z.enum(propertyTypes),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(5000),
  priceBdt: z.number().int().positive().max(maxPriceBdt),
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
});

type CoordinateValues = { latitude?: number | null; longitude?: number | null };

function coordinateIssues(value: CoordinateValues, ctx: z.RefinementCtx) {
  if (isSet(value.latitude) !== isSet(value.longitude)) {
    ctx.addIssue({ code: "custom", path: ["longitude"], message: "Set both coordinates or neither" });
  } else if (isSet(value.latitude) && !inBangladesh(value.latitude!, value.longitude!)) {
    // Spec 0005, AC-7: refused in every save, not only when resolving a link.
    ctx.addIssue({ code: "custom", path: ["latitude"], message: "That location is outside Bangladesh" });
  }
}

export const listingInput = listingFields.superRefine((value, ctx) => {
  for (const issue of typeRuleIssues(value.propertyType, value)) {
    ctx.addIssue({ code: "custom", path: [issue.field], message: issue.message });
  }
  coordinateIssues(value, ctx);
});

export type ListingInput = z.infer<typeof listingInput>;

// A draft or unpublished listing (spec 0005, AC-4): price, address, and
// description may be empty and the type's required fields may be missing, but
// every value present follows its rule, and must be empty fields stay empty.
export const listingDraftInput = listingFields
  .extend({
    description: z.string().trim().max(descriptionMax).nullish(),
    priceBdt: listingFields.shape.priceBdt.nullish(),
    addressLine: z.string().trim().max(200).nullish(),
  })
  .superRefine((value, ctx) => {
    for (const issue of typeRuleIssues(value.propertyType, value)) {
      if (issue.kind !== "required") ctx.addIssue({ code: "custom", path: [issue.field], message: issue.message });
    }
    coordinateIssues(value, ctx);
  });

export type ListingDraftInput = z.infer<typeof listingDraftInput>;
