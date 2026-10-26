import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { displayName } from "@/lib/domain/display-name";
import { db } from "@/lib/server/db";
import { uuidv7 } from "@/lib/server/uuid";

// The about page's reads and the contact form's lead (spec 0015).

export const contactInterests = { BUY: "Buy a home", SELL: "Sell my property", OTHER: "Something else" } as const;
export type ContactInterest = keyof typeof contactInterests;

export type ContactInput = {
  name: string;
  email: string | null;
  // Already E.164 (parsed by the action).
  phone: string;
  interest: ContactInterest;
  message: string;
  whatsapp: boolean;
};

// AC-2: a NEW CONTACT_FORM lead with no visitor, listing, conversation, or
// agent, so it shows in every agent's Mine only under Needs action (spec 0009).
export async function createContactLead(input: ContactInput): Promise<{ leadId: string }> {
  return db.$transaction(async (tx) => {
    const lead = await tx.lead.create({
      data: {
        id: uuidv7(),
        source: "CONTACT_FORM",
        status: "NEW",
        contactName: input.name,
        contactPhone: input.phone,
        contactEmail: input.email,
        contactWhatsapp: input.whatsapp,
        message: `${contactInterests[input.interest]}: ${input.message}`,
      },
      select: { id: true },
    });
    await tx.leadActivity.create({ data: { leadId: lead.id, actorId: null, type: "SYSTEM", body: "Lead created from the contact form" } });
    return { leadId: lead.id };
  });
}

export type PublicAgent = { id: string; name: string; title: string | null; bio: string | null; photoUrl: string | null };

// The team section: agents who chose to be public (spec 0015, *Team*).
export async function publicAgents(): Promise<PublicAgent[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("agents");
  const rows = await db.profile.findMany({
    where: { role: "AGENT", agentIsPublic: true, deletedAt: null, NOT: { fullName: "" } },
    select: { id: true, fullName: true, email: true, agentTitle: true, agentBio: true, agentPhotoUrl: true },
    orderBy: [{ fullName: "asc" }, { id: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    name: displayName(row),
    title: row.agentTitle,
    bio: row.agentBio,
    photoUrl: row.agentPhotoUrl,
  }));
}
