import { beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/server/auth";
import { rescheduleViewing } from "@/lib/server/bookings";
import { db } from "@/lib/server/db";
import { ListingNotBookableError } from "@/lib/server/errors";
import { transitionLead } from "@/lib/server/lead-status";
import { createConversation, createListing, createProfile, expectConstraint, bookViewing } from "./support/fixtures";

// Spec 0002: AC-8 (one open lead, one active viewing), AC-9 (contact snapshot).

let agent: Actor;

beforeAll(async () => {
  ({ actor: agent } = await createProfile("AGENT"));
});

const tomorrow = () => new Date(Date.now() + 24 * 3600 * 1000);
const nextWeek = () => new Date(Date.now() + 7 * 24 * 3600 * 1000);

describe("AC-8: one open lead and one active viewing", () => {
  it("turns two concurrent bookings into one lead and one active viewing", async () => {
    const listing = await createListing(agent, { publish: true });
    const { actor: visitor } = await createProfile("VISITOR");
    const input = { listingId: listing.id, requestedFor: tomorrow(), name: "Rahim Uddin", phone: "+8801711111111" };

    const results = await Promise.all([
      bookViewing(input, visitor),
      bookViewing(input, visitor),
    ]);

    expect(results.map((r) => r.leadReused).sort()).toEqual([false, true]);
    expect(results.map((r) => r.viewingReused).sort()).toEqual([false, true]);
    expect(results[0].lead.id).toBe(results[1].lead.id);
    expect(results[0].viewing.id).toBe(results[1].viewing.id);
    expect(await db.lead.count({ where: { visitorId: visitor.id, listingId: listing.id } })).toBe(1);
    expect(await db.viewing.count({ where: { leadId: results[0].lead.id } })).toBe(1);
  });

  // Spec 0007, AC-7 replaced spec 0002's unchanged snapshot for open leads.
  it("reuses an open lead, refreshing its contact copy but not its conversation, status, or active viewing", async () => {
    const listing = await createListing(agent, { publish: true });
    const { actor: visitor } = await createProfile("VISITOR");
    const conversation = await createConversation(visitor, listing.id);
    const first = await bookViewing(
      { listingId: listing.id, requestedFor: tomorrow(), name: "Rahim Uddin", phone: "+8801711111111", conversationId: conversation.id },
      visitor,
    );
    await transitionLead(first.lead.id, "CONTACTED", agent);

    const second = await bookViewing(
      { listingId: listing.id, requestedFor: nextWeek(), name: "R. Uddin", phone: "+8801722222222" },
      visitor,
    );
    expect(second.leadReused).toBe(true);
    expect(second.lead).toMatchObject({
      id: first.lead.id,
      status: "CONTACTED",
      contactName: "R. Uddin",
      contactPhone: "+8801722222222",
      conversationId: conversation.id,
    });
    expect(second.viewing).toEqual(first.viewing);
    const notes = await db.leadActivity.findMany({ where: { leadId: first.lead.id, type: "NOTE" } });
    expect(notes.map((n) => n.body)).toEqual(["Contact details updated by the visitor"]);
  });

  it("reschedules by cancelling the active viewing and creating a new one", async () => {
    const listing = await createListing(agent, { publish: true });
    const { actor: visitor } = await createProfile("VISITOR");
    const first = await bookViewing(
      { listingId: listing.id, requestedFor: tomorrow(), name: "Rahim", phone: "+8801711111111" },
      visitor,
    );
    const when = nextWeek();
    const replacement = await db.$transaction((tx) => rescheduleViewing(tx, first.viewing.id, when, agent, "Rescheduled"));

    const viewings = await db.viewing.findMany({ where: { leadId: first.lead.id }, orderBy: { createdAt: "asc" } });
    expect(viewings.map((v) => v.status)).toEqual(["CANCELLED", "REQUESTED"]);
    expect(viewings[1].id).toBe(replacement.id);
    expect(viewings[1].requestedFor).toEqual(when);
  });

  it("opens a new lead once the earlier one is closed", async () => {
    const listing = await createListing(agent, { publish: true });
    const { actor: visitor } = await createProfile("VISITOR");
    const input = { listingId: listing.id, requestedFor: tomorrow(), name: "Rahim", phone: "+8801711111111" };
    const first = await bookViewing(input, visitor);
    await transitionLead(first.lead.id, "LOST", agent);

    const second = await bookViewing(input, visitor);
    expect(second.leadReused).toBe(false);
    expect(second.lead.id).not.toBe(first.lead.id);
  });

  it("refuses a listing that is not PUBLISHED, and a non visitor", async () => {
    const draft = await createListing(agent);
    const { actor: visitor } = await createProfile("VISITOR");
    const input = { listingId: draft.id, requestedFor: tomorrow(), name: "Rahim", phone: "+8801711111111" };
    await expect(bookViewing(input, visitor)).rejects.toBeInstanceOf(ListingNotBookableError);
    await expect(bookViewing(input, agent)).rejects.toThrow("Forbidden");
  });

  it("refuses a conversation the visitor does not own", async () => {
    const listing = await createListing(agent, { publish: true });
    const { actor: visitor } = await createProfile("VISITOR");
    const { actor: stranger } = await createProfile("VISITOR");
    const theirs = await createConversation(stranger);
    await expect(
      bookViewing(
        { listingId: listing.id, requestedFor: tomorrow(), name: "Rahim", phone: "+8801711111111", conversationId: theirs.id },
        visitor,
      ),
    ).rejects.toThrow("Forbidden");
  });

  it("enforces one open lead and one active viewing in the database too", async () => {
    const listing = await createListing(agent, { publish: true });
    const { actor: visitor } = await createProfile("VISITOR");
    const { lead } = await bookViewing(
      { listingId: listing.id, requestedFor: tomorrow(), name: "Rahim", phone: "+8801711111111" },
      visitor,
    );
    await expectConstraint(
      db.lead.create({
        data: { source: "LISTING_INQUIRY", visitorId: visitor.id, listingId: listing.id, contactName: "x", contactPhone: "+8801700000000" },
      }),
      "leads_open_per_visitor_listing_uq",
    );
    await expectConstraint(
      db.viewing.create({ data: { leadId: lead.id, requestedFor: nextWeek() } }),
      "viewings_active_per_lead_uq",
    );
  });
});

describe("AC-9: contact snapshot", () => {
  // Spec 0007 moved the profile write to the caller (`requestViewing`).
  it("copies the booking contact, the profile email, and the listing's agent onto the lead", async () => {
    const listing = await createListing(agent, { publish: true });
    const { actor: visitor, profile } = await createProfile("VISITOR");
    const { lead, viewing } = await bookViewing(
      { listingId: listing.id, requestedFor: tomorrow(), name: "  Rahim Uddin  ", phone: "+8801711111111" },
      visitor,
    );

    expect(lead).toMatchObject({
      source: "CHAT_BOOKING",
      status: "NEW",
      contactName: "Rahim Uddin",
      contactPhone: "+8801711111111",
      contactEmail: profile.email,
      assignedAgentId: agent.id,
    });
    expect(viewing.status).toBe("REQUESTED");
    expect(lead.contactWhatsapp).toBe(true);
  });

  it("keeps the snapshot when the profile changes later", async () => {
    const listing = await createListing(agent, { publish: true });
    const { actor: visitor } = await createProfile("VISITOR");
    const { lead } = await bookViewing(
      { listingId: listing.id, requestedFor: tomorrow(), name: "Rahim", phone: "+8801711111111" },
      visitor,
    );
    await db.profile.update({ where: { id: visitor.id }, data: { phone: "+8801799999999", email: "new@test.example" } });
    expect(await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).toMatchObject({
      contactPhone: "+8801711111111",
      contactEmail: lead.contactEmail,
    });
  });

  it("books a visitor with no email, because the phone is required", async () => {
    const listing = await createListing(agent, { publish: true });
    const { actor: visitor } = await createProfile("VISITOR", { email: null });
    const { lead } = await bookViewing(
      { listingId: listing.id, requestedFor: tomorrow(), name: "Rahim", phone: "+8801711111111" },
      visitor,
    );
    expect(lead).toMatchObject({ contactEmail: null, contactPhone: "+8801711111111" });
    await expect(
      bookViewing({ listingId: listing.id, requestedFor: tomorrow(), name: "Rahim", phone: "" }, visitor),
    ).rejects.toThrow();
  });
});
