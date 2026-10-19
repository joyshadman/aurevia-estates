import "server-only";
import type { Brief } from "@/lib/domain/brief";
import { emptyBrief } from "@/lib/domain/brief";
import type { PropertyType } from "@/lib/domain/listing-card";
import type { Prisma, SearchBrief } from "@/lib/generated/prisma/client";
import { db } from "@/lib/server/db";
import { fromTaka, toTaka } from "@/lib/server/money";

// A conversation's search brief (spec 0002 table, spec 0006 behavior). Written
// only by the `updateBrief` tool and brief removal, under the conversation lock.

type Client = Pick<Prisma.TransactionClient, "searchBrief">;

export function toBrief(row: SearchBrief | null): Brief {
  if (!row) return emptyBrief;
  return {
    budgetMinBdt: row.budgetMinBdt === null ? null : toTaka(row.budgetMinBdt),
    budgetMaxBdt: row.budgetMaxBdt === null ? null : toTaka(row.budgetMaxBdt),
    propertyTypes: row.propertyTypes as PropertyType[],
    areaIds: row.areaIds,
    amenityIds: row.amenityIds,
    minBedrooms: row.minBedrooms,
    minBathrooms: row.minBathrooms,
    familySize: row.familySize,
    notes: row.notes,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function loadBrief(conversationId: string, client: Client = db): Promise<Brief> {
  return toBrief(await client.searchBrief.findUnique({ where: { conversationId } }));
}

// Fields present in the patch replace the stored ones (`null` clears one).
export type BriefPatch = Partial<Omit<Brief, "updatedAt">>;

export async function saveBrief(tx: Client, conversationId: string, patch: BriefPatch): Promise<Brief> {
  const current = await loadBrief(conversationId, tx);
  const next = { ...current, ...patch };
  // A minimum above the maximum is a slip of the tongue, not a contradiction.
  if (next.budgetMinBdt !== null && next.budgetMaxBdt !== null && next.budgetMinBdt > next.budgetMaxBdt) {
    [next.budgetMinBdt, next.budgetMaxBdt] = [next.budgetMaxBdt, next.budgetMinBdt];
  }
  const data = {
    budgetMinBdt: next.budgetMinBdt === null ? null : fromTaka(next.budgetMinBdt),
    budgetMaxBdt: next.budgetMaxBdt === null ? null : fromTaka(next.budgetMaxBdt),
    propertyTypes: [...new Set(next.propertyTypes)],
    areaIds: [...new Set(next.areaIds)],
    amenityIds: [...new Set(next.amenityIds)],
    minBedrooms: next.minBedrooms,
    minBathrooms: next.minBathrooms,
    familySize: next.familySize,
    notes: next.notes,
  };
  const row = await tx.searchBrief.upsert({
    where: { conversationId },
    create: { conversationId, ...data },
    update: data,
  });
  return toBrief(row);
}
