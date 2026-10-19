import "server-only";
import type { Brief } from "@/lib/domain/brief";
import type { Prisma } from "@/lib/generated/prisma/client";
import { db } from "@/lib/server/db";

// Reference data the assistant reads each turn (spec 0006, *Prompt and context*).

type Client = Pick<Prisma.TransactionClient, "area" | "amenity" | "assistantFactSheet">;

export type AreaRef = { id: string; slug: string; nameEn: string; nameBn: string };
export type AmenityRef = { id: string; slug: string; label: string; labelBn: string | null };

export type ReferenceData = { areas: AreaRef[]; amenities: AmenityRef[] };

// Active areas and amenities, in display order. The model names them by slug.
export async function loadReferenceData(client: Client = db): Promise<ReferenceData> {
  const [areas, amenities] = await Promise.all([
    client.area.findMany({
      where: { isActive: true },
      select: { id: true, slug: true, nameEn: true, nameBn: true },
      orderBy: { sortOrder: "asc" },
    }),
    client.amenity.findMany({
      where: { isActive: true },
      select: { id: true, slug: true, label: true, labelBn: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  return { areas, amenities };
}

// The live version: the newest by `created_at desc, id desc` (spec 0006).
export async function liveFactSheet(client: Client = db) {
  return client.assistantFactSheet.findFirst({ orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
}

// The brief as the model sees it: slugs instead of ids, no empty fields.
export function briefForModel(brief: Brief, refs: ReferenceData) {
  const areaSlug = new Map(refs.areas.map((a) => [a.id, a.slug]));
  const amenitySlug = new Map(refs.amenities.map((a) => [a.id, a.slug]));
  const view = {
    budgetMinBdt: brief.budgetMinBdt,
    budgetMaxBdt: brief.budgetMaxBdt,
    propertyTypes: brief.propertyTypes,
    areaSlugs: brief.areaIds.flatMap((id) => areaSlug.get(id) ?? []),
    amenitySlugs: brief.amenityIds.flatMap((id) => amenitySlug.get(id) ?? []),
    minBedrooms: brief.minBedrooms,
    minBathrooms: brief.minBathrooms,
    familySize: brief.familySize,
    notes: brief.notes,
  };
  return Object.fromEntries(
    Object.entries(view).filter(([, value]) => value !== null && !(Array.isArray(value) && value.length === 0)),
  );
}
