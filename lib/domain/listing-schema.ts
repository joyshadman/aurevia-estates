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

// Per field rules, shared by the full input and the draft input (spec 0005).
const fieldRules = {
  propertyType: z.enum(propertyTypes),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(5000),
  priceBdt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  priceNegotiable: z.boolean(),
  areaId: z.uuid(),
  addressLine: z.string().trim().min(1).max(200),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  bedrooms: count,
  bathrooms: count,
  builtUpSqft: z.number().int().positive().max(10_000_000),
  landKatha: z
    .number()
    .positive()
    .max(99_999.99)
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, { message: "At most two decimal places" }),
  floorNumber: z.number().int().min(-5).max(200),
  totalFloors: z.number().int().min(1).max(200),
  parkingSpaces: count,
  completionStatus: z.enum(["READY", "UNDER_CONSTRUCTION"]),
  handoverDate: z.iso.date(),
  amenityIds: z.array(z.uuid()).max(50),
};

export const listingInput = z
  .object({
    propertyType: fieldRules.propertyType,
    title: fieldRules.title,
    description: fieldRules.description,
    priceBdt: fieldRules.priceBdt,
    priceNegotiable: fieldRules.priceNegotiable.default(false),
    areaId: fieldRules.areaId,
    addressLine: fieldRules.addressLine,
    latitude: fieldRules.latitude.nullish(),
    longitude: fieldRules.longitude.nullish(),
    bedrooms: fieldRules.bedrooms.nullish(),
    bathrooms: fieldRules.bathrooms.nullish(),
    builtUpSqft: fieldRules.builtUpSqft.nullish(),
    landKatha: fieldRules.landKatha.nullish(),
    floorNumber: fieldRules.floorNumber.nullish(),
    totalFloors: fieldRules.totalFloors.nullish(),
    parkingSpaces: fieldRules.parkingSpaces.nullish(),
    completionStatus: fieldRules.completionStatus.nullish(),
    handoverDate: fieldRules.handoverDate.nullish(),
    amenityIds: fieldRules.amenityIds.default([]),
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

// ---------------------------------------------------------------------------
// Agent listing form (spec 0005).

// Price limit for the agent form (AC-6).
export const maxPriceBdt = 10_000_000_000;
// Description length: drafts up to 3,000; publishing needs 50 to 3,000 (AC-14).
export const descriptionMax = 3000;
export const descriptionMinToPublish = 50;

// Empty text clears a field, like `null` (AC-4).
const clearable = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), schema.nullable()).optional();

// A save: any subset of fields, each individually valid. A key left out stays
// unchanged; `null` clears it (AC-4). Type rules are applied after the merge.
export const listingDraftInput = z.object({
  title: fieldRules.title.optional(),
  propertyType: fieldRules.propertyType.optional(),
  areaId: fieldRules.areaId.optional(),
  addressLine: clearable(fieldRules.addressLine),
  priceBdt: clearable(fieldRules.priceBdt.max(maxPriceBdt, "Up to BDT 10,000,000,000")),
  priceNegotiable: fieldRules.priceNegotiable.optional(),
  bedrooms: clearable(fieldRules.bedrooms),
  bathrooms: clearable(fieldRules.bathrooms),
  builtUpSqft: clearable(fieldRules.builtUpSqft),
  landKatha: clearable(fieldRules.landKatha),
  floorNumber: clearable(fieldRules.floorNumber),
  totalFloors: clearable(fieldRules.totalFloors),
  parkingSpaces: clearable(fieldRules.parkingSpaces),
  completionStatus: clearable(fieldRules.completionStatus),
  handoverDate: clearable(fieldRules.handoverDate),
  latitude: clearable(fieldRules.latitude),
  longitude: clearable(fieldRules.longitude),
  description: clearable(z.string().trim().min(1).max(descriptionMax, "Up to 3,000 characters")),
  amenityIds: fieldRules.amenityIds.optional(),
});

export type ListingDraftInput = z.input<typeof listingDraftInput>;
export type ListingDraftFields = z.output<typeof listingDraftInput>;
export type EditableField = keyof ListingDraftFields;

// Labels for the form, the checklist, and `missing` lists.
export const fieldLabels: Record<EditableField | "photos" | "cover" | "location", string> = {
  title: "Title",
  propertyType: "Property type",
  areaId: "Area",
  addressLine: "Address line",
  priceBdt: "Price",
  priceNegotiable: "Negotiable",
  bedrooms: "Bedrooms",
  bathrooms: "Bathrooms",
  builtUpSqft: "Built up area (sqft)",
  landKatha: "Land (katha)",
  floorNumber: "Floor number",
  totalFloors: "Total floors",
  parkingSpaces: "Parking spaces",
  completionStatus: "Completion status",
  handoverDate: "Handover date",
  latitude: "Latitude",
  longitude: "Longitude",
  description: "Description",
  amenityIds: "Amenities",
  photos: "At least one photo",
  cover: "A cover photo",
  location: "Map location",
};

// Fields a type hides on the form; saving clears them (AC-3). `handoverDate`
// follows `completionStatus` instead.
export function fieldsClearedByType(type: PropertyType): TypeField[] {
  return typeRules[type].empty;
}
