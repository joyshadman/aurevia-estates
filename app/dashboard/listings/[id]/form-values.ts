import { typeFields, typeRules, type TypeField } from "@/lib/domain/listing-schema";
import type { PropertyType } from "@/lib/domain/listing-card";
import type { NearbyPlace, PlaceKind, TravelMode } from "@/lib/maps";
import type { ListingForEdit } from "@/lib/server/agent-listings";

// The edit form's text state and its conversion to a save payload (spec 0005,
// AC-3, AC-4, AC-6). Pure, so it is easy to reason about apart from the UI.

export type FormText = {
  title: string;
  propertyType: PropertyType;
  areaId: string;
  addressLine: string;
  price: string;
  priceNegotiable: boolean;
  bedrooms: string;
  bathrooms: string;
  builtUpSqft: string;
  landKatha: string;
  floorNumber: string;
  totalFloors: string;
  parkingSpaces: string;
  completionStatus: "" | "READY" | "UNDER_CONSTRUCTION";
  handoverDate: string;
  latitude: string;
  longitude: string;
  description: string;
  amenityIds: string[];
  // Nearby places in the agent's order; `key` is a local row id (spec 0011, AC-6).
  nearbyPlaces: PlaceRow[];
};

export type PlaceRow = { key: string; name: string; kind: PlaceKind; minutes: string; mode: TravelMode };

let rowCounter = 0;
export function newPlaceRow(place?: NearbyPlace): PlaceRow {
  rowCounter += 1;
  return { key: `place-${rowCounter}`, name: place?.name ?? "", kind: place?.kind ?? "SCHOOL", minutes: place ? String(place.minutes) : "", mode: place?.mode ?? "DRIVE" };
}

const text = (value: number | string | null) => (value === null ? "" : String(value));

export function initialForm(listing: ListingForEdit): FormText {
  const v = listing.values;
  return {
    title: v.title,
    propertyType: v.propertyType,
    areaId: v.areaId,
    addressLine: v.addressLine ?? "",
    price: v.priceBdt === null ? "" : v.priceBdt.toLocaleString("en-US"),
    priceNegotiable: v.priceNegotiable,
    bedrooms: text(v.bedrooms),
    bathrooms: text(v.bathrooms),
    builtUpSqft: text(v.builtUpSqft),
    landKatha: text(v.landKatha),
    floorNumber: text(v.floorNumber),
    totalFloors: text(v.totalFloors),
    parkingSpaces: text(v.parkingSpaces),
    completionStatus: v.completionStatus ?? "",
    handoverDate: v.handoverDate ?? "",
    latitude: text(v.latitude),
    longitude: text(v.longitude),
    description: v.description ?? "",
    amenityIds: listing.amenityIds,
    nearbyPlaces: listing.nearbyPlaces.map((place) => newPlaceRow(place)),
  };
}

// Type fields the form shows for a type; the rest must stay empty (AC-3).
export function visibleTypeFields(type: PropertyType): TypeField[] {
  return typeFields.filter((field) => !typeRules[type].empty.includes(field));
}

// Entered values a type change would clear on save, for the warning (AC-3).
export function clearedByType(form: FormText, type: PropertyType): TypeField[] {
  return typeRules[type].empty.filter((field) => form[field] !== "");
}

// Whole taka; commas and spaces allowed (AC-6). `undefined` means unreadable.
export function parsePrice(value: string): number | null | undefined {
  const digits = value.replace(/[,\s]/g, "");
  if (digits === "") return null;
  return /^\d+$/.test(digits) ? Number(digits) : undefined;
}

const integer = (value: string) => (value.trim() === "" ? null : /^-?\d+$/.test(value.trim()) ? Number(value) : undefined);
const decimal = (value: string) => (value.trim() === "" ? null : /^-?\d+(\.\d+)?$/.test(value.trim()) ? Number(value) : undefined);

// What the form sends: every field it holds (a subset is fine for the server).
export type FormPayload = {
  title: string;
  propertyType: PropertyType;
  areaId: string;
  addressLine: string;
  priceBdt?: number | null;
  priceNegotiable: boolean;
  bedrooms?: number | null;
  bathrooms?: number | null;
  builtUpSqft?: number | null;
  landKatha?: number | null;
  floorNumber?: number | null;
  totalFloors?: number | null;
  parkingSpaces?: number | null;
  completionStatus: "READY" | "UNDER_CONSTRUCTION" | null;
  handoverDate: string | null;
  latitude?: number | null;
  longitude?: number | null;
  description: string;
  amenityIds: string[];
  nearbyPlaces: NearbyPlace[];
};

type NumberField = "bedrooms" | "bathrooms" | "builtUpSqft" | "floorNumber" | "totalFloors" | "parkingSpaces";
const integerFields: NumberField[] = ["bedrooms", "bathrooms", "builtUpSqft", "floorNumber", "totalFloors", "parkingSpaces"];

// The whole form as a save payload, or the fields that can't be read.
export function toFields(form: FormText): { fields: FormPayload; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const visible = new Set<string>(visibleTypeFields(form.propertyType));
  const fields: FormPayload = {
    title: form.title.trim(),
    propertyType: form.propertyType,
    areaId: form.areaId,
    addressLine: form.addressLine,
    priceNegotiable: form.priceNegotiable,
    description: form.description,
    amenityIds: form.amenityIds,
    nearbyPlaces: [],
    completionStatus: visible.has("completionStatus") && form.completionStatus ? form.completionStatus : null,
    handoverDate: form.completionStatus === "UNDER_CONSTRUCTION" && form.handoverDate ? form.handoverDate : null,
  };

  const price = parsePrice(form.price);
  if (price === undefined) errors.priceBdt = "Whole taka only, like 12,500,000";
  else fields.priceBdt = price;

  for (const field of integerFields) {
    if (!visible.has(field) && field !== "totalFloors" && field !== "parkingSpaces") {
      fields[field] = null;
      continue;
    }
    const value = integer(form[field]);
    if (value === undefined) errors[field] = "Enter a whole number";
    else fields[field] = value;
  }

  if (visible.has("landKatha")) {
    const katha = decimal(form.landKatha);
    if (katha === undefined) errors.landKatha = "Enter a number, like 5 or 5.25";
    else fields.landKatha = katha;
  } else {
    fields.landKatha = null;
  }

  const lat = decimal(form.latitude);
  const lng = decimal(form.longitude);
  if (lat === undefined || lng === undefined) errors.latitude = "Use the location finder to set coordinates";
  else Object.assign(fields, { latitude: lat, longitude: lng });

  // Nearby places (spec 0011, AC-6): errors keyed per row, as the server does.
  form.nearbyPlaces.forEach((row, i) => {
    const name = row.name.trim();
    if (!name) errors[`nearbyPlaces.${i}.name`] = "Name the place";
    const minutes = /^\d+$/.test(row.minutes.trim()) ? Number(row.minutes) : NaN;
    if (!(minutes >= 1 && minutes <= 120)) errors[`nearbyPlaces.${i}.minutes`] = "1 to 120 minutes";
    fields.nearbyPlaces.push({ name, kind: row.kind, minutes, mode: row.mode });
  });

  return { fields, errors };
}

// Values for the live publish checklist (AC-5). Unreadable numbers count as unset.
export function checklistValues(form: FormText) {
  const { fields } = toFields(form);
  return {
    propertyType: form.propertyType,
    priceBdt: fields.priceBdt ?? null,
    addressLine: form.addressLine,
    latitude: fields.latitude ?? null,
    longitude: fields.longitude ?? null,
    description: form.description,
    bedrooms: fields.bedrooms ?? null,
    bathrooms: fields.bathrooms ?? null,
    builtUpSqft: fields.builtUpSqft ?? null,
    landKatha: fields.landKatha ?? null,
    floorNumber: fields.floorNumber ?? null,
    completionStatus: fields.completionStatus ?? null,
  };
}
