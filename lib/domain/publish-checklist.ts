import { descriptionMax, descriptionMinToPublish, fieldLabels, typeRules, type TypeField } from "@/lib/domain/listing-schema";
import type { PropertyType } from "@/lib/domain/listing-card";

// What Publish needs (spec 0005, AC-5). Pure: the edit page runs it on the
// form's state, the server on the merged result inside the publish transaction.

export type ChecklistValues = {
  propertyType: PropertyType;
  priceBdt: number | null;
  addressLine: string | null;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
} & Partial<Record<TypeField, unknown>>;

export type ChecklistItem = { key: string; label: string; done: boolean };

const isSet = (value: unknown) => value !== null && value !== undefined && value !== "";

export function checklistItems(values: ChecklistValues, photos: { isCover: boolean }[]): ChecklistItem[] {
  const description = values.description?.trim() ?? "";
  const items: ChecklistItem[] = typeRules[values.propertyType].required.map((field) => ({
    key: field,
    label: fieldLabels[field],
    done: isSet(values[field]),
  }));
  items.push(
    { key: "priceBdt", label: fieldLabels.priceBdt, done: isSet(values.priceBdt) },
    { key: "addressLine", label: fieldLabels.addressLine, done: isSet(values.addressLine?.trim()) },
    { key: "location", label: fieldLabels.location, done: isSet(values.latitude) && isSet(values.longitude) },
    {
      key: "description",
      label: `Description (${descriptionMinToPublish} to ${descriptionMax.toLocaleString("en-US")} characters)`,
      done: description.length >= descriptionMinToPublish && description.length <= descriptionMax,
    },
    { key: "photos", label: fieldLabels.photos, done: photos.length > 0 },
    { key: "cover", label: fieldLabels.cover, done: photos.some((p) => p.isCover) },
  );
  return items;
}

export function publishChecklist(values: ChecklistValues, photos: { isCover: boolean }[]) {
  const items = checklistItems(values, photos);
  const missing = items.filter((item) => !item.done).map((item) => item.label);
  return { complete: missing.length === 0, missing, items };
}
