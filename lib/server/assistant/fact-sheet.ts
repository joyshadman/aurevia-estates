import "server-only";
import { db } from "@/lib/server/db";

// The agency fact sheet (spec 0006, AC-14). The live version is the newest by
// `(created_at desc, id desc)`, which is also the one no version replaced.

export async function liveFactSheet() {
  return db.assistantFactSheet.findFirst({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, body: true, createdAt: true },
  });
}
