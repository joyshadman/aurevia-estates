import "server-only";
import { VISITOR_CANCEL_REASON, VISITOR_RESCHEDULE_REASON } from "@/lib/domain/viewing-slots";
import type { Actor } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { ForbiddenError } from "@/lib/server/errors";
import { transitionViewingIn } from "@/lib/server/viewing-status";

// Account deletion (spec 0017, AC-4, AC-5): the spec 0002 AC-10 shape plus the
// spec 0007 scrub additions, in one transaction. The profile stays as a
// tombstone, so leads keep their history for the agent with no personal data.

export const DELETED_CANCEL_REASON = "Visitor deleted their account";
// Spec 0002, *Value sourcing* (Delete account): the scrub constants.
const SCRUBBED_CANCEL_REASON = "Removed on account deletion";
export const DELETED_CONTACT_NAME = "Deleted user";
// `leads_contact_ck` needs a phone or an email, so the lead keeps the
// tombstone address, which names no one (spec 0017, *Assumption built on*).
export const tombstoneEmail = (id: string) => `deleted+${id}@deleted.invalid`;
// Fixed reasons we write ourselves carry nothing personal and stay.
const keptReasons = [VISITOR_CANCEL_REASON, VISITOR_RESCHEDULE_REASON, DELETED_CANCEL_REASON, SCRUBBED_CANCEL_REASON];

export async function deleteVisitorAccount(actor: Actor) {
  // Agent accounts own listings (spec 0005): the agency removes them.
  if (actor.role !== "VISITOR") throw new ForbiddenError();

  await db.$transaction(
    async (tx) => {
      // Every booking by this visitor queues on this lock (spec 0007), so none lands mid deletion.
      const [profile] = await tx.$queryRaw<{ email: string }[]>`
        SELECT email FROM profiles WHERE id = ${actor.id}::uuid AND deleted_at IS NULL FOR UPDATE`;
      if (!profile) return;

      const leads = await tx.lead.findMany({ where: { visitorId: actor.id }, select: { id: true } });
      const leadIds = leads.map((lead) => lead.id);

      // Spec 0007: the visitor's own notes and cancel reasons go first, so the
      // cancel notes written below stay readable for the agent.
      await tx.leadActivity.updateMany({ where: { actorId: actor.id }, data: { body: null } });
      await tx.viewing.updateMany({
        where: { leadId: { in: leadIds }, cancelReason: { not: null, notIn: keptReasons } },
        data: { cancelReason: SCRUBBED_CANCEL_REASON },
      });

      // A deleted visitor won't come: cancel what is still active (spec 0017).
      const active = await tx.viewing.findMany({
        where: { leadId: { in: leadIds }, status: { in: ["REQUESTED", "CONFIRMED"] } },
        select: { id: true },
      });
      for (const viewing of active) {
        await transitionViewingIn(tx, viewing.id, "CANCELLED", actor, { cancelReason: DELETED_CANCEL_REASON });
      }

      // Spec 0002, AC-10: the contact snapshot, then the link to the visitor.
      await tx.lead.updateMany({
        where: { id: { in: leadIds } },
        data: {
          visitorId: null,
          contactName: DELETED_CONTACT_NAME,
          contactPhone: null,
          contactEmail: tombstoneEmail(actor.id),
          contactWhatsapp: null,
          message: null,
        },
      });

      // Chats go by cascade (messages, briefs, recommendations).
      await tx.conversation.deleteMany({ where: { userId: actor.id } });
      await tx.savedHome.deleteMany({ where: { profileId: actor.id } });
      await tx.aiUsageDaily.deleteMany({ where: { userId: actor.id } });
      // Spec 0019, AC-6: no email goes out to a deleted account.
      await tx.emailOutbox.deleteMany({ where: { OR: [{ profileId: actor.id }, { toEmail: profile.email }] } });

      // No way back in: Better Auth's rows, and any code still waiting.
      await tx.session.deleteMany({ where: { userId: actor.id } });
      await tx.account.deleteMany({ where: { userId: actor.id } });
      await tx.twoFactor.deleteMany({ where: { userId: actor.id } });
      await tx.verification.deleteMany({ where: { identifier: { contains: profile.email } } });

      // The tombstone. The email moves aside, so the address can sign up afresh (AC-4).
      await tx.profile.update({
        where: { id: actor.id },
        data: {
          deletedAt: new Date(),
          email: tombstoneEmail(actor.id),
          emailVerified: false,
          twoFactorEnabled: false,
          fullName: "",
          phone: null,
          avatarUrl: null,
          agentTitle: null,
          agentWhatsapp: null,
          agentBio: null,
          agentPhotoUrl: null,
          agentIsPublic: false,
        },
      });
    },
    { timeout: 20_000 },
  );
}
