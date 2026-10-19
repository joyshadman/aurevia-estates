import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { recordUsage } from "@/lib/server/ai-usage";
import { getCurrentUser, getSessionUser, type Actor } from "@/lib/server/auth";
import { findOrCreateLeadAndViewing } from "@/lib/server/bookings";
import { saveMessage } from "@/lib/server/chat-store";
import { db } from "@/lib/server/db";
import { transitionLead } from "@/lib/server/lead-status";
import { transitionViewing } from "@/lib/server/viewing-status";
import { uuidv7 } from "@/lib/server/uuid";
import { createConversation, createListing, createProfile, expectConstraint } from "./support/fixtures";

// Spec 0002, AC-10: the account deletion shape, the profile tombstone, and the
// lead anonymization checks. Also the AI usage counter (Value sourcing).

const session = vi.hoisted(() => ({ claims: null as null | { sub: string; email?: string } }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims: async () => ({ data: session.claims && { claims: session.claims }, error: null }) },
  }),
}));

// The scrub as spec 0002 defines it (the flow itself is feature 17): one
// transaction; viewings first, while their leads still point at the visitor.
async function scrubAccount(userId: string) {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE profiles SET deleted_at = COALESCE(deleted_at, now()), full_name = NULL, email = NULL, phone = NULL,
        avatar_url = NULL, agent_title = NULL, agent_whatsapp = NULL, agent_bio = NULL, agent_photo_url = NULL,
        agent_is_public = false, updated_at = now()
      WHERE id = ${userId}::uuid`;
    await tx.conversation.deleteMany({ where: { userId } });
    await tx.aiUsageDaily.deleteMany({ where: { userId } });
    await tx.$executeRaw`
      UPDATE viewings SET cancel_reason = 'Removed on account deletion', updated_at = now()
      WHERE cancel_reason IS NOT NULL
        AND lead_id IN (SELECT id FROM leads WHERE visitor_id = ${userId}::uuid AND anonymized_at IS NULL)`;
    await tx.$executeRaw`
      UPDATE leads SET anonymized_at = now(), visitor_id = NULL, contact_name = 'Deleted user',
        contact_phone = NULL, contact_email = NULL, message = NULL, updated_at = now()
      WHERE visitor_id = ${userId}::uuid AND anonymized_at IS NULL`;
  });
}

let agent: Actor;

beforeAll(async () => {
  ({ actor: agent } = await createProfile("AGENT"));
});

const tomorrow = () => new Date(Date.now() + 24 * 3600 * 1000);

describe("AC-10: account deletion shape", () => {
  it("removes chats and usage, keeps scrubbed leads and viewings, and keeps the profile as a tombstone", async () => {
    const listing = await createListing(agent, { publish: true });
    const other = await createListing(agent, { publish: true });
    const { actor: visitor } = await createProfile("VISITOR");

    const conversation = await createConversation(visitor, listing.id);
    const reply = { id: uuidv7(), role: "assistant" as const, parts: [{ type: "text", text: "Here you go" }] };
    await saveMessage(conversation.id, reply, visitor, { origin: "server", recommendedListingIds: [listing.id] });
    await db.searchBrief.create({ data: { conversationId: conversation.id, minBedrooms: 3 } });
    await recordUsage(visitor.id, { inputTokens: 100, outputTokens: 50 });

    const booked = await findOrCreateLeadAndViewing(
      { listingId: listing.id, requestedFor: tomorrow(), name: "Rahim Uddin", phone: "+8801711111111", conversationId: conversation.id },
      visitor,
    );
    await transitionViewing(booked.viewing.id, "CANCELLED", agent, { cancelReason: "Rahim is travelling to Dhaka" });
    const second = await findOrCreateLeadAndViewing(
      { listingId: other.id, requestedFor: tomorrow(), name: "Rahim Uddin", phone: "+8801711111111" },
      visitor,
    );
    await db.lead.update({ where: { id: second.lead.id }, data: { message: "Call me after 6pm" } });

    await scrubAccount(visitor.id);

    expect(await db.conversation.count({ where: { userId: visitor.id } })).toBe(0);
    expect(await db.chatMessage.count({ where: { conversationId: conversation.id } })).toBe(0);
    expect(await db.searchBrief.count({ where: { conversationId: conversation.id } })).toBe(0);
    expect(await db.listingRecommendation.count({ where: { conversationId: conversation.id } })).toBe(0);
    expect(await db.aiUsageDaily.count({ where: { userId: visitor.id } })).toBe(0);

    const leads = await db.lead.findMany({ where: { id: { in: [booked.lead.id, second.lead.id] } } });
    expect(leads).toHaveLength(2);
    for (const lead of leads) {
      expect(lead).toMatchObject({
        visitorId: null,
        conversationId: null,
        contactName: "Deleted user",
        contactPhone: null,
        contactEmail: null,
        message: null,
      });
      expect(lead.anonymizedAt).toBeInstanceOf(Date);
    }
    const cancelled = await db.viewing.findUniqueOrThrow({ where: { id: booked.viewing.id } });
    expect(cancelled.cancelReason).toBe("Removed on account deletion");
    expect((await db.viewing.findUniqueOrThrow({ where: { id: second.viewing.id } })).cancelReason).toBeNull();

    const tombstone = await db.profile.findUniqueOrThrow({ where: { id: visitor.id } });
    expect(tombstone).toMatchObject({ fullName: null, email: null, phone: null, avatarUrl: null, agentIsPublic: false });
    expect(tombstone.deletedAt).toBeInstanceOf(Date);
  });

  it("keeps the first anonymized_at when the scrub runs again", async () => {
    const listing = await createListing(agent, { publish: true });
    const { actor: visitor } = await createProfile("VISITOR");
    const { lead } = await findOrCreateLeadAndViewing(
      { listingId: listing.id, requestedFor: tomorrow(), name: "Rahim", phone: "+8801711111111" },
      visitor,
    );
    await scrubAccount(visitor.id);
    const first = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
    await scrubAccount(visitor.id);
    expect(await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).toEqual(first);
  });

  it("lets an agent still close an anonymized open lead, and gives a returning person a new lead", async () => {
    const listing = await createListing(agent, { publish: true });
    const { actor: visitor } = await createProfile("VISITOR");
    const { lead } = await findOrCreateLeadAndViewing(
      { listingId: listing.id, requestedFor: tomorrow(), name: "Rahim", phone: "+8801711111111" },
      visitor,
    );
    await scrubAccount(visitor.id);
    expect((await transitionLead(lead.id, "LOST", agent)).status).toBe("LOST");

    const { actor: returning } = await createProfile("VISITOR");
    const fresh = await findOrCreateLeadAndViewing(
      { listingId: listing.id, requestedFor: tomorrow(), name: "Rahim", phone: "+8801711111111" },
      returning,
    );
    expect(fresh.reused).toBe(false);
  });

  it("rejects an anonymized lead that still holds a visitor, phone, or email", async () => {
    const { actor: visitor } = await createProfile("VISITOR");
    const anonymizedAt = new Date();
    const base = { source: "CONTACT_FORM" as const, contactName: "Deleted user", anonymizedAt };
    await expectConstraint(db.lead.create({ data: { ...base, contactPhone: "+8801700000000" } }), "leads_anonymized_ck");
    await expectConstraint(db.lead.create({ data: { ...base, contactEmail: "a@test.example" } }), "leads_anonymized_ck");
    await expectConstraint(db.lead.create({ data: { ...base, visitorId: visitor.id } }), "leads_anonymized_ck");
    await expect(db.lead.create({ data: base })).resolves.toMatchObject({ anonymizedAt });
  });

  it("rejects a lead that is not anonymized and has neither phone nor email", async () => {
    await expectConstraint(
      db.lead.create({ data: { source: "CONTACT_FORM", contactName: "Signed out visitor" } }),
      "leads_contact_ck",
    );
    const lead = await db.lead.create({ data: { source: "CONTACT_FORM", contactName: "x", contactEmail: "a@test.example" } });
    await expectConstraint(db.lead.update({ where: { id: lead.id }, data: { contactEmail: null } }), "leads_contact_ck");
  });

  it("has no foreign key from profiles to auth users, so deleting the auth user keeps the tombstone", async () => {
    const [{ count }] = await db.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM pg_constraint WHERE conrelid = 'profiles'::regclass AND contype = 'f'`;
    expect(count).toBe(BigInt(0));
  });
});

describe("AC-10: getCurrentUser and the tombstone", () => {
  beforeEach(() => {
    session.claims = null;
  });

  it("creates exactly one VISITOR profile when first requests race", async () => {
    const id = uuidv7();
    session.claims = { sub: id, email: "first@test.example" };
    const users = await Promise.all([getCurrentUser(), getCurrentUser(), getCurrentUser()]);
    expect(users).toEqual(Array(3).fill({ id, email: "first@test.example", role: "VISITOR" }));
    expect(await db.profile.count({ where: { id } })).toBe(1);
  });

  it("treats a deleted profile as signed out and never touches it", async () => {
    const { profile } = await createProfile("VISITOR");
    await scrubAccount(profile.id);
    const before = await db.profile.findUniqueOrThrow({ where: { id: profile.id } });
    session.claims = { sub: profile.id, email: "again@test.example" };

    expect(await getCurrentUser()).toBeNull();
    expect(await getSessionUser()).toBeNull();
    expect(await db.profile.findUniqueOrThrow({ where: { id: profile.id } })).toEqual(before);
  });

  it("returns the role from the database, and never creates a profile from getSessionUser", async () => {
    const { profile } = await createProfile("AGENT");
    session.claims = { sub: profile.id, email: "spoofed@test.example" };
    expect(await getCurrentUser()).toEqual({ id: profile.id, email: profile.email, role: "AGENT" });

    const id = uuidv7();
    session.claims = { sub: id };
    expect(await getSessionUser()).toBeNull();
    expect(await db.profile.count({ where: { id } })).toBe(0);
  });

  it("returns null with no session", async () => {
    expect(await getCurrentUser()).toBeNull();
  });
});

describe("AI usage counter", () => {
  it("counts messages and tokens per Asia/Dhaka day, with missing usage as zero", async () => {
    const { actor: visitor } = await createProfile("VISITOR");
    await recordUsage(visitor.id, { inputTokens: 120, outputTokens: 30 });
    await recordUsage(visitor.id);
    const row = await recordUsage(visitor.id, { inputTokens: Number.NaN, outputTokens: -5 });

    const dhakaToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());
    expect(row).toEqual({ day: dhakaToday, messageCount: 3, inputTokens: 120, outputTokens: 30 });
    expect(await db.aiUsageDaily.count({ where: { userId: visitor.id } })).toBe(1);
  });

  it("computes the day in Dhaka, not UTC, whatever the session time zone", async () => {
    const [{ day, utc }] = await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'America/Los_Angeles'");
      return tx.$queryRaw<{ day: string; utc: string }[]>`
        SELECT ((timestamptz '2026-01-01 23:30:00+00') AT TIME ZONE 'Asia/Dhaka')::date::text AS day,
               ((timestamptz '2026-01-01 23:30:00+00') AT TIME ZONE 'UTC')::date::text AS utc`;
    });
    expect({ day, utc }).toEqual({ day: "2026-01-02", utc: "2026-01-01" });
  });
});
