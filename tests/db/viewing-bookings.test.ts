import { beforeAll, describe, expect, it } from "vitest";
import { availableSlots, isAvailableSlot } from "@/lib/domain/viewing-slots";
import { runAssistantTurn } from "@/lib/server/assistant/turn";
import type { Actor, CurrentUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { transitionLead } from "@/lib/server/lead-status";
import { transitionListing } from "@/lib/server/listing-status";
import { uuidv7 } from "@/lib/server/uuid";
import {
  cancelViewing,
  changeViewingTime,
  getBookingCardData,
  listMyViewings,
  requestViewing,
  viewingCards,
} from "@/lib/server/viewing-bookings";
import { transitionViewing } from "@/lib/server/viewing-status";
import { createConversation, createListing, createProfile } from "./support/fixtures";
import { finishTurn, scriptedModel } from "./support/mock-model";

// Spec 0007: viewing booking from chat.

const hour = 3600_000;
// A fixed Wednesday noon in Sylhet (06:00 UTC), so the slot window is known.
const now = new Date("2026-10-21T06:00:00.000Z");

let agent: Actor;

beforeAll(async () => {
  const { actor } = await createProfile("AGENT", { fullName: "Nadia Rahman" });
  agent = actor;
  await db.profile.update({ where: { id: agent.id }, data: { agentIsPublic: true } });
});

async function visitor(): Promise<CurrentUser> {
  const { profile } = await createProfile("VISITOR");
  return { id: profile.id, email: profile.email, role: "VISITOR" };
}

// A visitor with a conversation that started from a published listing (so it's shown).
async function setup() {
  const listing = await createListing(agent, { publish: true });
  const user = await visitor();
  const conversation = await createConversation(user, listing.id);
  return { listing, user, conversation };
}

const slot = (n = 0) => availableSlots(now)[n].start;
const form = (conversationId: string, listingId: string, start = slot()) => ({
  conversationId,
  listingId,
  start,
  name: "Rahim Uddin",
  phone: "01711-111111",
  countryCode: "BD",
  whatsapp: true,
  note: "We have two children.",
});

describe("AC-3: slots", () => {
  it("offers tomorrow through day 14 in Dhaka, never today, day 15, or a Friday", () => {
    const slots = availableSlots(now);
    const dates = [...new Set(slots.map((s) => s.date))];
    expect(dates[0]).toBe("2026-10-22");
    expect(dates.at(-1)).toBe("2026-11-04");
    expect(dates).not.toContain("2026-10-21");
    expect(dates).not.toContain("2026-11-05");
    // 2026-10-23 and 2026-10-30 are Fridays.
    expect(dates).not.toContain("2026-10-23");
    expect(dates).not.toContain("2026-10-30");
    expect(slots.filter((s) => s.date === "2026-10-22").map((s) => s.time)).toEqual(["10:00", "12:00", "15:00", "17:00"]);
    // 10:00 in Sylhet is 04:00 UTC.
    expect(slots[0].start).toBe("2026-10-22T04:00:00.000Z");
    expect(isAvailableSlot("2026-10-22T04:00:00.000Z", now)).toBe(true);
    expect(isAvailableSlot("2026-10-22T04:30:00.000Z", now)).toBe(false);
  });
});

describe("AC-1, AC-12: the offerViewing tool", () => {
  it("shows a card for a shown, published home; not for an unshown code or a non visitor", async () => {
    const { listing, user, conversation } = await setup();
    const other = await createListing(agent, { publish: true });
    const { model } = scriptedModel([
      { tools: [{ name: "offerViewing", input: { refCode: listing.refCode, suggestedNote: "Family of four" } }] },
      { tools: [{ name: "offerViewing", input: { refCode: other.refCode } }] },
      { text: "Pick a time on the card." },
    ]);
    const turn = await finishTurn(
      await runAssistantTurn(
        { user, conversationId: conversation.id, message: { id: uuidv7(), role: "user", parts: [{ type: "text", text: "Can we see it?" }] }, locale: "en", trigger: "submit-message" },
        { model, factSheet: "Facts." },
      ),
    );
    const offers = turn.message.parts.filter((p) => p.type === "tool-offerViewing").map((p) => p.output);
    expect(offers).toEqual([
      { listingId: listing.id, refCode: listing.refCode, suggestedNote: "Family of four" },
      { error: "not_shown", refCode: other.refCode },
    ]);
    // No viewing exists until Confirm.
    expect(await db.viewing.count({ where: { lead: { visitorId: user.id } } })).toBe(0);
  });

  it("refuses agents and sellers", async () => {
    const { listing, conversation } = await setup();
    const { profile: seller } = await createProfile("SELLER");
    expect(await requestViewing(form(conversation.id, listing.id), agent, now)).toEqual({ ok: false, reason: "not_visitor" });
    expect(await requestViewing(form(conversation.id, listing.id), { id: seller.id, role: "SELLER" }, now)).toEqual({
      ok: false,
      reason: "not_visitor",
    });
  });
});

describe("AC-2, AC-4, AC-5: booking", () => {
  it("prefills from the profile and books with a saved confirmation, no model call or usage", async () => {
    const { listing, user, conversation } = await setup();
    await db.profile.update({ where: { id: user.id }, data: { fullName: "Rahim", phone: "+447400123456", phoneIsWhatsapp: false } });
    const card = await getBookingCardData({ conversationId: conversation.id, listingId: listing.id }, user, now);
    expect(card).toMatchObject({
      ok: true,
      refCode: listing.refCode,
      advisorName: "Nadia Rahman",
      prefill: { name: "Rahim", phone: "7400123456", countryCode: "GB", whatsapp: false },
      existing: null,
    });

    const result = await requestViewing(form(conversation.id, listing.id), user, now);
    expect(result).toMatchObject({ ok: true, reused: false });
    const lead = await db.lead.findFirstOrThrow({ where: { visitorId: user.id }, include: { viewings: true } });
    expect(lead).toMatchObject({ source: "CHAT_BOOKING", contactPhone: "+8801711111111", contactWhatsapp: true, message: "We have two children." });
    expect(lead.viewings[0].requestedFor.toISOString()).toBe(slot());
    expect(await db.profile.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      fullName: "Rahim Uddin",
      phone: "+8801711111111",
      phoneIsWhatsapp: true,
    });
    const saved = await db.chatMessage.findFirstOrThrow({ where: { conversationId: conversation.id, role: "ASSISTANT" } });
    expect(saved.parts).toEqual([{ type: "data-viewing", data: { leadId: lead.id, viewingId: lead.viewings[0].id } }]);
    expect(await db.aiUsageDaily.count({ where: { userId: user.id } })).toBe(0);
  });

  it("turns a double submit into one lead, one viewing, one confirmation, both succeeding", async () => {
    const { listing, user, conversation } = await setup();
    const [a, b] = await Promise.all([
      requestViewing(form(conversation.id, listing.id), user, now),
      requestViewing(form(conversation.id, listing.id), user, now),
    ]);
    expect([a.ok, b.ok]).toEqual([true, true]);
    expect([(a as { reused: boolean }).reused, (b as { reused: boolean }).reused].sort()).toEqual([false, true]);
    expect(await db.viewing.count({ where: { lead: { visitorId: user.id } } })).toBe(1);
    expect(await db.chatMessage.count({ where: { conversationId: conversation.id, role: "ASSISTANT" } })).toBe(1);
  });

  it("refuses a stale slot with fresh slots, a bad phone, a home not shown, and during a reply", async () => {
    const { listing, user, conversation } = await setup();
    const stale = await requestViewing(form(conversation.id, listing.id, "2026-10-21T04:00:00.000Z"), user, now);
    expect(stale).toMatchObject({ ok: false, reason: "slot_unavailable" });
    expect((stale as { slots: unknown[] }).slots.length).toBeGreaterThan(0);

    expect(await requestViewing({ ...form(conversation.id, listing.id), phone: "12" }, user, now)).toMatchObject({
      ok: false,
      reason: "invalid",
      fieldErrors: { phone: expect.any(String) },
    });

    const unshown = await createListing(agent, { publish: true });
    expect(await requestViewing(form(conversation.id, unshown.id), user, now)).toEqual({ ok: false, reason: "not_found" });

    await db.conversation.update({ where: { id: conversation.id }, data: { turnStartedAt: new Date() } });
    expect(await requestViewing(form(conversation.id, listing.id), user, now)).toEqual({ ok: false, reason: "turn_in_progress" });
  });
});

describe("AC-6, AC-7, AC-10: reuse, contact refresh, caps", () => {
  it("shows the existing viewing instead of booking another time", async () => {
    const { listing, user, conversation } = await setup();
    await requestViewing(form(conversation.id, listing.id), user, now);
    const again = await requestViewing(form(conversation.id, listing.id, slot(1)), user, now);
    expect(again).toMatchObject({ ok: false, reason: "already_booked", existing: { start: slot(), status: "REQUESTED" } });
    expect(await getBookingCardData({ conversationId: conversation.id, listingId: listing.id }, user, now)).toMatchObject({
      existing: { start: slot(), canChange: true },
    });
  });

  it("joins an open lead with no active viewing, refreshes its contact, and links the new conversation", async () => {
    const { listing, user, conversation } = await setup();
    const first = await requestViewing(form(conversation.id, listing.id), user, now);
    await cancelViewing({ viewingId: (first as { viewingId: string }).viewingId }, user, now);

    const second = await createConversation(user, listing.id);
    const result = await requestViewing({ ...form(second.id, listing.id, slot(2)), phone: "01999-999999", note: "Evenings please" }, user, now);
    expect(result).toMatchObject({ ok: true, leadId: (first as { leadId: string }).leadId });
    const notes = await db.leadActivity.findMany({ where: { leadId: (first as { leadId: string }).leadId, type: "NOTE" }, orderBy: { createdAt: "asc" } });
    expect(notes.map((n) => n.body)).toEqual(["Contact details updated by the visitor", "Evenings please", "Booked again from another conversation"]);
    expect((await db.lead.findUniqueOrThrow({ where: { id: (first as { leadId: string }).leadId } })).contactPhone).toBe("+8801999999999");
  });

  it("opens a new lead after a WON one and leaves the old one untouched", async () => {
    const { listing, user, conversation } = await setup();
    const first = await requestViewing(form(conversation.id, listing.id), user, now);
    const leadId = (first as { leadId: string }).leadId;
    await transitionLead(leadId, "CONTACTED", agent);
    await transitionLead(leadId, "QUALIFIED", agent);
    await transitionLead(leadId, "WON", agent);
    const second = await requestViewing({ ...form(conversation.id, listing.id, slot(3)), name: "New Name" }, user, now);
    expect((second as { leadId: string }).leadId).not.toBe(leadId);
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).contactName).toBe("Rahim Uddin");
  });

  it("refuses a 6th active viewing", async () => {
    const user = await visitor();
    for (let i = 0; i < 6; i++) {
      const listing = await createListing(agent, { publish: true });
      const conversation = await createConversation(user, listing.id);
      const result = await requestViewing(form(conversation.id, listing.id, slot(i)), user, now);
      if (i < 5) expect(result).toMatchObject({ ok: true });
      else expect(result).toEqual({ ok: false, reason: "too_many_viewings" });
    }
  });
});

describe("AC-9, AC-10: change and cancel", () => {
  it("changes more than 2 hours before, refuses inside 2 hours, the same time, a closed lead, and a 4th change", async () => {
    const { listing, user, conversation } = await setup();
    const booked = await requestViewing(form(conversation.id, listing.id), user, now);
    let viewingId = (booked as { viewingId: string }).viewingId;

    expect(await changeViewingTime({ viewingId, start: slot() }, user, now)).toEqual({ ok: false, reason: "unchanged" });
    const late = new Date(new Date(slot()).getTime() - 1.5 * hour);
    expect(await changeViewingTime({ viewingId, start: slot(5) }, user, late)).toEqual({ ok: false, reason: "too_late" });
    expect(await cancelViewing({ viewingId }, user, late)).toEqual({ ok: false, reason: "too_late" });

    for (let i = 1; i <= 3; i++) {
      const changed = await changeViewingTime({ viewingId, start: slot(i) }, user, now);
      expect(changed).toMatchObject({ ok: true });
      viewingId = (changed as { viewingId: string }).viewingId;
    }
    expect(await changeViewingTime({ viewingId, start: slot(9) }, user, now)).toEqual({ ok: false, reason: "too_many_changes" });

    const viewings = await db.viewing.findMany({ where: { lead: { visitorId: user.id } }, orderBy: { createdAt: "asc" } });
    expect(viewings.map((v) => [v.status, v.cancelReason])).toEqual([
      ["CANCELLED", "Rescheduled by visitor"],
      ["CANCELLED", "Rescheduled by visitor"],
      ["CANCELLED", "Rescheduled by visitor"],
      ["REQUESTED", null],
    ]);
  });

  it("refuses a change on a closed lead or unpublished home, but cancel still works", async () => {
    const { listing, user, conversation } = await setup();
    const booked = await requestViewing(form(conversation.id, listing.id), user, now);
    const viewingId = (booked as { viewingId: string }).viewingId;
    await transitionListing(listing.id, "UNPUBLISHED", agent);
    expect(await changeViewingTime({ viewingId, start: slot(1) }, user, now)).toEqual({ ok: false, reason: "listing_unavailable" });
    expect(await cancelViewing({ viewingId, reason: "Plans changed" }, user, now)).toEqual({ ok: true });
    expect((await db.viewing.findUniqueOrThrow({ where: { id: viewingId } })).cancelReason).toBe("Plans changed");

    const other = await setup();
    const second = await requestViewing(form(other.conversation.id, other.listing.id), other.user, now);
    await transitionLead((second as { leadId: string }).leadId, "LOST", agent);
    expect(await changeViewingTime({ viewingId: (second as { viewingId: string }).viewingId, start: slot(1) }, other.user, now)).toEqual({
      ok: false,
      reason: "lead_closed",
    });
  });

  it("returns not_found for another visitor's viewing", async () => {
    const { listing, user, conversation } = await setup();
    const booked = await requestViewing(form(conversation.id, listing.id), user, now);
    const stranger = await visitor();
    const viewingId = (booked as { viewingId: string }).viewingId;
    expect(await cancelViewing({ viewingId }, stranger, now)).toEqual({ ok: false, reason: "not_found" });
    expect(await changeViewingTime({ viewingId, start: slot(1) }, stranger, now)).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("AC-8, AC-11, AC-13: live cards, the account list, model notes", () => {
  it("follows the lead: confirmed time, rescheduled, awaiting update, and unavailable homes", async () => {
    const { listing, user, conversation } = await setup();
    const booked = (await requestViewing(form(conversation.id, listing.id), user, now)) as { leadId: string; viewingId: string };
    const ref = { leadId: booked.leadId, viewingId: booked.viewingId };

    const confirmedFor = new Date(slot(2));
    await transitionViewing(booked.viewingId, "CONFIRMED", agent, { confirmedFor });
    let cards = await viewingCards([ref], user, now);
    expect(cards[booked.viewingId].current).toMatchObject({ status: "CONFIRMED", start: confirmedFor.toISOString(), confirmed: true });

    // Past its start, still active: awaiting update.
    cards = await viewingCards([ref], user, new Date(confirmedFor.getTime() + hour));
    expect(cards[booked.viewingId].current.awaitingUpdate).toBe(true);

    await transitionListing(listing.id, "UNPUBLISHED", agent);
    cards = await viewingCards([ref], user, now);
    expect(cards[booked.viewingId].listing.available).toBe(false);
    expect(await viewingCards([ref], await visitor(), now)).toEqual({});
  });

  it("shows 'rescheduled' on the original card after a change", async () => {
    const { listing, user, conversation } = await setup();
    const booked = (await requestViewing(form(conversation.id, listing.id), user, now)) as { leadId: string; viewingId: string };
    const changed = (await changeViewingTime({ viewingId: booked.viewingId, start: slot(1) }, user, now)) as { viewingId: string };
    const cards = await viewingCards([{ leadId: booked.leadId, viewingId: booked.viewingId }], user, now);
    expect(cards[booked.viewingId]).toMatchObject({ rescheduled: true, current: { viewingId: changed.viewingId, start: slot(1) } });

    const mine = await listMyViewings(user, now);
    expect(mine.upcoming.map((r) => r.current.viewingId)).toEqual([changed.viewingId]);
    expect(mine.recent).toEqual([]);
  });

  it("gives the model a note with the current booking in later turns", async () => {
    const { listing, user, conversation } = await setup();
    await requestViewing(form(conversation.id, listing.id), user, now);
    const { model, prompts } = scriptedModel([{ text: "Your viewing is soon." }]);
    await finishTurn(
      await runAssistantTurn(
        { user, conversationId: conversation.id, message: { id: uuidv7(), role: "user", parts: [{ type: "text", text: "When is my viewing?" }] }, locale: "en", trigger: "submit-message" },
        { model, factSheet: "Facts." },
      ),
    );
    expect(JSON.stringify(prompts[0])).toContain(`<note>Viewing for ${listing.refCode}: Thu 22 Oct, 10:00 AM Sylhet, status REQUESTED.</note>`);
  });
});
