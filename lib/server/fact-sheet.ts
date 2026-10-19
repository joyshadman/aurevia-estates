import "server-only";
import { z } from "zod";
import { Prisma } from "@/lib/generated/prisma/client";
import type { Actor } from "@/lib/server/auth";
import { liveFactSheet } from "@/lib/server/assistant/context";
import { db } from "@/lib/server/db";

// The agency fact sheet (spec 0006, AC-14). Every save is a new version that
// names the version it replaced; `previous_id` is unique, so two saves from the
// same version can't both land. The live version is the newest.

export const factSheetMax = 4000;

export type FactSheetFailure = { ok: false; reason: "forbidden" | "invalid" | "stale" | "not_found"; message?: string };

const body = z.string().trim().min(1, "Write something first").max(factSheetMax, "Up to 4,000 characters");

async function insertVersion(
  input: { body: string; previousId: string | null; restoredFromId?: string },
  actor: Actor,
): Promise<{ ok: true; id: string } | FactSheetFailure> {
  if (actor.role !== "AGENT") return { ok: false, reason: "forbidden" };
  try {
    return await db.$transaction(async (tx) => {
      // Serialize saves, then confirm the form was looking at the live version.
      await tx.$executeRaw`LOCK TABLE assistant_fact_sheets IN SHARE ROW EXCLUSIVE MODE`;
      const live = await liveFactSheet(tx);
      if ((live?.id ?? null) !== input.previousId) return { ok: false as const, reason: "stale" as const };
      const created = await tx.assistantFactSheet.create({
        data: {
          body: input.body,
          previousId: input.previousId,
          createdById: actor.id,
          restoredFromId: input.restoredFromId ?? null,
          createdAt: new Date(),
        },
        select: { id: true },
      });
      return { ok: true as const, id: created.id };
    });
  } catch (error) {
    // The unique `previous_id` is the last line of defence; the transaction rolled back.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, reason: "stale" };
    throw error;
  }
}

export async function saveFactSheet(raw: { body: string; previousId: string | null }, actor: Actor) {
  const parsed = z.object({ body, previousId: z.uuid().nullable() }).safeParse(raw);
  if (!parsed.success) return { ok: false as const, reason: "invalid" as const, message: parsed.error.issues[0]?.message };
  return insertVersion(parsed.data, actor);
}

// Restoring saves the old text as a new version (AC-14).
export async function restoreFactSheet(raw: { versionId: string; previousId: string | null }, actor: Actor) {
  const parsed = z.object({ versionId: z.uuid(), previousId: z.uuid().nullable() }).safeParse(raw);
  if (!parsed.success) return { ok: false as const, reason: "not_found" as const };
  const version = await db.assistantFactSheet.findUnique({ where: { id: parsed.data.versionId }, select: { id: true, body: true } });
  if (!version) return { ok: false as const, reason: "not_found" as const };
  return insertVersion({ body: version.body, previousId: parsed.data.previousId, restoredFromId: version.id }, actor);
}

export async function factSheetVersions(limit = 30) {
  const rows = await db.assistantFactSheet.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    select: {
      id: true,
      body: true,
      createdAt: true,
      restoredFromId: true,
      createdBy: { select: { fullName: true, email: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    restored: row.restoredFromId !== null,
    author: row.createdBy ? row.createdBy.fullName?.trim() || row.createdBy.email?.split("@")[0] || "An agent" : "The seed",
  }));
}
