import { beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/server/auth";
import { saveMessage } from "@/lib/server/chat-store";
import { db } from "@/lib/server/db";
import {
  addLeadNote,
  changeLeadStatus,
  changeViewing,
  getLeadDetail,
  leadConversation,
  listLeads,
  takeLead,
} from "@/lib/server/lead-inbox";
import { uuidv7 } from "@/lib/server/uuid";
import { bookViewing, createConversation, createListing, createProfile } from "./support/fixtures";

// Spec 0008 (assumed): the agent lead inbox, over spec 0002's access rules.

let agent: Actor;
let colleague: Actor;
const inTwoDays = () => new Date(Date.now() + 2 * 86_400_000);

beforeAll(async () => {
  ({ actor: agent } = await createProfile("AGENT", { fullName: "Nadia Rahman" }));
  ({ actor: colleague } = await createProfile("AGENT", { fullName: "Mahbub Alam" }));
});

async function booked(owner = agent) {
  const listing = await createListing(owner, { publish: true });
  const { actor: visitor } = await createProfile("VISITOR");
  const conversation = await createConversation(visitor, listing.id);
  const result = await bookViewing(
    { listingId: listing.id, requestedFor: inTwoDays(), name: "Rahim Uddin", phone: "+8801711111111", conversationId: conversation.id, note: "Evenings" },
    visitor,
  );
  return { ...result, listing, visitor, conversation };
}

describe("the inbox table", () => {
  it("shows open leads assigned to me by default, with contact, home, and current viewing", async () => {
    const mine = await booked(agent);
    const theirs = await booked(colleague);
    const page = await listLeads({}, agent);
    const ids = page.rows.map((r) => r.id);
    expect(ids).toContain(mine.lead.id);
    expect(ids).not.toContain(theirs.lead.id);
    const row = page.rows.find((r) => r.id === mine.lead.id)!;
    expect(row).toMatchObject({
      contactName: "Rahim Uddin",
      contactPhone: "+8801711111111",
      contactWhatsapp: true,
      listing: { refCode: mine.listing.refCode },
      viewing: { status: "REQUESTED", start: mine.viewing.requestedFor.toISOString() },
      source: "CHAT_BOOKING",
      status: "NEW",
    });

    expect((await listLeads({ mine: false }, agent)).rows.map((r) => r.id)).toContain(theirs.lead.id);
    await changeLeadStatus({ leadId: mine.lead.id, to: "LOST" }, agent);
    expect((await listLeads({}, agent)).rows.map((r) => r.id)).not.toContain(mine.lead.id);
    expect((await listLeads({ tab: "all" }, agent)).rows.map((r) => r.id)).toContain(mine.lead.id);
  });

  it("refuses non agents", async () => {
    const { actor: visitor } = await createProfile("VISITOR");
    await expect(listLeads({}, visitor)).rejects.toThrow("Forbidden");
    await expect(getLeadDetail(uuidv7(), visitor)).rejects.toThrow("Forbidden");
  });
});

describe("one lead", () => {
  it("marks contacted, confirms at another time, then completes, with history", async () => {
    const { lead, viewing } = await booked();
    expect(await changeLeadStatus({ leadId: lead.id, to: "CONTACTED" }, agent)).toEqual({ ok: true });
    expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).contactedAt).toBeInstanceOf(Date);
    // A move the state machine forbids.
    expect(await changeLeadStatus({ leadId: lead.id, to: "WON" }, agent)).toEqual({ ok: false, reason: "stale_status" });

    const day = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    expect(await changeViewing({ action: "confirm", viewingId: viewing.id, date: day, time: "16:30" }, agent)).toEqual({ ok: true });
    const confirmed = await db.viewing.findUniqueOrThrow({ where: { id: viewing.id } });
    expect(confirmed.confirmedFor?.toISOString()).toBe(`${day}T10:30:00.000Z`);
    expect(await changeViewing({ action: "complete", viewingId: viewing.id }, agent)).toEqual({ ok: true });

    const detail = await getLeadDetail(lead.id, agent);
    expect(detail?.viewings[0].status).toBe("COMPLETED");
    expect(detail?.activities.map((a) => a.type)).toEqual(
      expect.arrayContaining(["STATUS_CHANGE", "VIEWING_CHANGE", "SYSTEM"]),
    );
    expect(detail?.message).toBe("Evenings");
  });

  it("refuses a confirmation in the past and a bad time", async () => {
    const { viewing } = await booked();
    expect(await changeViewing({ action: "confirm", viewingId: viewing.id, date: "2020-01-01", time: "10:00" }, agent)).toMatchObject({
      ok: false,
      reason: "invalid",
    });
    expect(await changeViewing({ action: "confirm", viewingId: viewing.id, date: "tomorrow", time: "10" }, agent)).toMatchObject({
      ok: false,
      reason: "invalid",
    });
  });

  it("cancels with a reason, adds notes, and takes an unassigned lead once", async () => {
    const { lead, viewing } = await booked();
    expect(await changeViewing({ action: "cancel", viewingId: viewing.id, reason: "Buyer travelling" }, agent)).toEqual({ ok: true });
    expect((await db.viewing.findUniqueOrThrow({ where: { id: viewing.id } })).cancelReason).toBe("Buyer travelling");
    expect(await addLeadNote({ leadId: lead.id, body: "Called, will call back Sunday." }, agent)).toEqual({ ok: true });
    expect(await addLeadNote({ leadId: lead.id, body: " " }, agent)).toMatchObject({ ok: false, reason: "invalid" });

    const contact = await db.lead.create({ data: { source: "CONTACT_FORM", contactName: "Walk in", contactEmail: "walk@test.example" } });
    const [a, b] = await Promise.all([takeLead({ leadId: contact.id }, agent), takeLead({ leadId: contact.id }, colleague)]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
  });

  it("shows the linked chat read only, and nothing for a lead without one", async () => {
    const { lead, conversation, visitor } = await booked();
    await saveMessage(conversation.id, { id: uuidv7(), role: "user", parts: [{ type: "text", text: "Is it still available?" }] }, visitor);
    const transcript = await leadConversation(lead.id, agent);
    expect(transcript?.messages.map((m) => m.text)).toContain("Is it still available?");

    const contact = await db.lead.create({ data: { source: "CONTACT_FORM", contactName: "Walk in", contactEmail: "walk2@test.example" } });
    expect(await leadConversation(contact.id, agent)).toBeNull();
  });
});
