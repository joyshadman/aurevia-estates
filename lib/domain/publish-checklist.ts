import type { PropertyType } from "@/lib/domain/listing-card";
import { descriptionMax, descriptionPublishMin, typeRules, type TypeField } from "@/lib/domain/listing-schema";

// What Publish needs (spec 0005, AC-5). Pure: the edit page runs it on the form
// state as the agent types, and the server reruns it on the saved result under
// the row lock.

export type ChecklistValues = {
  propertyType: PropertyType;
  priceBdt: number | null;
  addressLine: string | null;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
} & Partial<Record<TypeField, unknown>>;

export const typeFieldLabels: Record<TypeField, string> = {
  bedrooms: "Bedrooms",
  bathrooms: "Bathrooms",
  builtUpSqft: "Built up size",
  landKatha: "Land size",
  floorNumber: "Floor number",
  completionStatus: "Completion status",
};

export type ChecklistItem = { label: string; met: boolean };

const isSet = (value: unknown) => value !== null && value !== undefined && value !== "";

export function publishChecklist(values: ChecklistValues, photos: { isCover: boolean }[]) {
  const descriptionLength = values.description?.trim().length ?? 0;
  const items: ChecklistItem[] = [
    ...typeRules[values.propertyType].required.map((field) => ({ label: typeFieldLabels[field], met: isSet(values[field]) })),
    { label: "Price", met: isSet(values.priceBdt) },
    { label: "Address", met: isSet(values.addressLine?.trim()) },
    { label: "Map location", met: isSet(values.latitude) && isSet(values.longitude) },
    {
      label: `Description (${descriptionPublishMin} to ${descriptionMax.toLocaleString("en-US")} characters)`,
      met: descriptionLength >= descriptionPublishMin && descriptionLength <= descriptionMax,
    },
    { label: "A photo", met: photos.length > 0 },
    { label: "A cover photo", met: photos.some((photo) => photo.isCover) },
  ];
  const missing = items.filter((item) => !item.met).map((item) => item.label);
  return { complete: missing.length === 0, missing, items };
}
