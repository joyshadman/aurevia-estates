import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/lib/server/db";

// The About page's advisors (spec 0014): public agent cards only, the same rule
// as the property page's advisor card (spec 0009, AC-6).

export type AboutAdvisor = { id: string; name: string; title: string | null; photoUrl: string | null };

export async function publicAdvisors(): Promise<AboutAdvisor[]> {
  "use cache";
  // An agent's profile save updates `listings` (app/account/actions.ts).
  cacheTag("listings");
  cacheLife("hours");
  const rows = await db.profile.findMany({
    where: { role: "AGENT", agentIsPublic: true, deletedAt: null, fullName: { not: null } },
    select: { id: true, fullName: true, agentTitle: true, agentPhotoUrl: true },
    orderBy: [{ fullName: "asc" }, { id: "asc" }],
    take: 24,
  });
  return rows
    .filter((r) => r.fullName?.trim())
    .map((r) => ({ id: r.id, name: r.fullName!.trim(), title: r.agentTitle, photoUrl: r.agentPhotoUrl }));
}
