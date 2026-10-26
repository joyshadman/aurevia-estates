import "server-only";
import { z } from "zod";
import { factSheetMax } from "@/lib/domain/fact-sheet";
import type { Actor } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { uuidv7 } from "@/lib/server/uuid";

// The agency fact sheet (spec 0006, AC-14). The live version is the newest by
// `(created_at desc, id desc)`, which is also the one no version replaced.

export const factSheetBody = z.string().trim().min(1).max(factSheetMax);

export async function liveFactSheet() {
  return db.assistantFactSheet.findFirst({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, body: true, createdAt: true },
  });
}

export type FactSheetVersion = {
  id: string;
  body: string;
  createdAt: string;
  author: string | null;
  first: boolean;
  restoredFrom: string | null;
};

// Every version, newest first, with its author (spec 0006, *Value sourcing*).
export async function factSheetVersions(): Promise<FactSheetVersion[]> {
  const rows = await db.assistantFactSheet.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      body: true,
      createdAt: true,
      previousId: true,
      restoredFrom: { select: { createdAt: true } },
      createdBy: { select: { fullName: true, email: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    author: row.createdBy ? row.createdBy.fullName || row.createdBy.email : null,
    first: row.previousId === null,
    restoredFrom: row.restoredFrom?.createdAt.toISOString() ?? null,
  }));
}

export type FactSheetResult = { ok: true; id: string } | { ok: false; reason: "stale" | "not_found" };

// One statement: it inserts only when `previousId` is still the live version,
// and the unique `previous_id` turns the second of two racing saves from the
// same version into a no row result, so exactly one succeeds (AC-14).
async function insertVersion(actor: Actor, body: string, previousId: string, restoredFromId: string | null): Promise<FactSheetResult> {
  const inserted = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO assistant_fact_sheets (id, body, previous_id, created_by_id, restored_from_id, created_at)
    SELECT ${uuidv7()}::uuid, ${body}, ${previousId}::uuid, ${actor.id}::uuid, ${restoredFromId}::uuid, ${new Date()}
    WHERE ${previousId}::uuid = (SELECT id FROM assistant_fact_sheets ORDER BY created_at DESC, id DESC LIMIT 1)
    ON CONFLICT (previous_id) DO NOTHING
    RETURNING id`;
  return inserted.length === 0 ? { ok: false, reason: "stale" } : { ok: true, id: inserted[0].id };
}

export async function saveFactSheet(actor: Actor, body: string, previousId: string): Promise<FactSheetResult> {
  return insertVersion(actor, body, previousId, null);
}

// A restore saves the old body as a new version (AC-14).
export async function restoreFactSheet(actor: Actor, versionId: string, previousId: string): Promise<FactSheetResult> {
  const version = await db.assistantFactSheet.findUnique({ where: { id: versionId }, select: { body: true } });
  if (!version) return { ok: false, reason: "not_found" };
  return insertVersion(actor, version.body, previousId, versionId);
}
