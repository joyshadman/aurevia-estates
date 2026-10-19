import { beforeAll, describe, expect, it } from "vitest";
import { runAssistantTurn, type TurnRequest } from "@/lib/server/assistant/turn";
import type { CurrentUser } from "@/lib/server/auth";
import {
  chatCards,
  chatSidePanes,
  deleteConversation,
  listConversations,
  loadConversationPage,
  loadMoreMatches,
  removeBriefItem,
  renameConversation,
  startListingBySlug,
} from "@/lib/server/conversations";
import { db } from "@/lib/server/db";
import { factSheetVersions, restoreFactSheet, saveFactSheet } from "@/lib/server/fact-sheet";
import { liveFactSheet } from "@/lib/server/assistant/context";
import { transitionListing } from "@/lib/server/listing-status";
import { uuidv7 } from "@/lib/server/uuid";
import { createConversation, createListing, createProfile } from "./support/fixtures";
import { finishTurn, scriptedModel } from "./support/mock-model";

// Spec 0006, milestones 2 to 5: conversations (AC-11), Show more (AC-4), brief
// removal (AC-12), current cards (AC-18), starting points (AC-13), fact sheet (AC-14).

const tag = Date.now().toString(36);
let agent: CurrentUser;
let area: { id: string; slug: string };
const listings: { id: string; refCode: string; slug: string }[] = [];

async function visitor(): Promise<CurrentUser> {
  const { profile } = await createProfile("VISITOR");
  return { id: profile.id, email: profile.email, role: profile.role };
}

const request = (user: CurrentUser, text: string, extra: Partial<TurnRequest> = {}): TurnRequest => ({
  user,
  message: { id: uuidv7(), role: "user", parts: [{ type: "text", text }] },
  locale: "en",
  trigger: "submit-message",
  ...extra,
});

// One turn that fills the brief with this test's far away area and searches.
async function searchTurn(user: CurrentUser, conversationId?: string) {
  const { model } = scriptedModel([
    { tools: [{ name: "updateBrief", input: { areaSlugs: [area.slug], budgetMaxBdt: 20_000_000 } }] },
    { tools: [{ name: "searchListings", input: {} }] },
    { text: "Here are homes that fit." },
  ]);
  return finishTurn(await runAssistantTurn(request(user, "Homes in my test area", { conversationId }), { model, factSheet: "Facts." }));
}

beforeAll(async () => {
  const { profile } = await createProfile("AGENT", { fullName: "Fact Agent" });
  agent = { id: profile.id, email: profile.email, role: "AGENT" };
  // Far from every other test area, so only these listings match.
  area = await db.area.create({
    data: { slug: `t-conv-${tag}`, nameEn: "Conv Town", nameBn: "কনভ", centerLat: 21.0, centerLng: 89.5, sortOrder: 950 },
    select: { id: true, slug: true },
  });
  for (let i = 0; i < 7; i++) {
    const row = await createListing(agent, {
      areaId: area.id,
      publish: true,
      priceBdt: 10_000_000 + i * 100_000,
      title: `Conv home ${i} ${tag}`,
      latitude: 21.0,
      longitude: 89.5,
    });
    listings.push({ id: row.id, refCode: row.refCode, slug: row.slug });
  }
});

describe("AC-11: conversations", () => {
  it("lists the user's own conversations newest first, 20 a page, titled or 'New conversation'", async () => {
    const user = await visitor();
    for (let i = 0; i < 22; i++) await createConversation(user);
    const other = await visitor();
    await createConversation(other);

    const first = await listConversations(user);
    expect(first.rows).toHaveLength(20);
    expect(first.rows[0].title).toBe("New conversation");
    const second = await listConversations(user, first.nextCursor!);
    expect(second.rows).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.rows, ...second.rows].map((r) => r.id)).size).toBe(22);
  });

  it("renames and deletes only the owner's conversation; others get not_found", async () => {
    const owner = await visitor();
    const stranger = await visitor();
    const conversation = await createConversation(owner);

    expect(await renameConversation({ id: conversation.id, title: "Mine" }, stranger)).toEqual({ ok: false, reason: "not_found" });
    expect(await renameConversation({ id: conversation.id, title: "" }, owner)).toEqual({ ok: false, reason: "invalid" });
    expect(await renameConversation({ id: conversation.id, title: "Family search" }, owner)).toEqual({ ok: true });
    expect((await db.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).title).toBe("Family search");

    expect(await deleteConversation({ id: conversation.id }, stranger)).toEqual({ ok: false, reason: "not_found" });
    expect(await loadConversationPage(conversation.id, stranger)).toBeNull();
    expect(await deleteConversation({ id: "not-a-uuid" }, owner)).toEqual({ ok: false, reason: "not_found" });
  });

  it("deleting keeps a booked lead with a null conversation, and waits for a running reply", async () => {
    const owner = await visitor();
    const conversation = await createConversation(owner);
    const lead = await db.lead.create({
      data: { source: "CHAT_BOOKING", visitorId: owner.id, listingId: listings[0].id, conversationId: conversation.id, contactName: "Buyer", contactPhone: "+8801712345678" },
    });

    await db.conversation.update({ where: { id: conversation.id }, data: { turnStartedAt: new Date() } });
    expect(await deleteConversation({ id: conversation.id }, owner)).toEqual({ ok: false, reason: "turn_in_progress" });
    await db.conversation.update({ where: { id: conversation.id }, data: { turnStartedAt: null } });

    expect(await deleteConversation({ id: conversation.id }, owner)).toEqual({ ok: true });
    expect(await db.conversation.findUnique({ where: { id: conversation.id } })).toBeNull();
    expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).conversationId).toBeNull();
  });
});

describe("AC-4: Show more", () => {
  it("appends the next 3 without a model call or a limit slot, restarts on a new brief, and ends", async () => {
    const user = await visitor();
    const turn = await searchTurn(user);
    expect(turn.outcome).toBe("finished");
    const usageBefore = await db.aiUsageDaily.findFirst({ where: { userId: user.id } });

    const more = await loadMoreMatches({ conversationId: turn.conversationId }, user);
    expect(more).toMatchObject({ ok: true, done: false });
    const message = (more as { message: { parts: { data: { cards: { refCode: string }[]; hasMore: boolean } }[] } }).message;
    expect(message.parts[0].data.cards).toHaveLength(3);
    expect(message.parts[0].data.hasMore).toBe(true);

    const usageAfter = await db.aiUsageDaily.findFirst({ where: { userId: user.id } });
    expect(usageAfter?.messageCount).toBe(usageBefore?.messageCount);

    // Rows were recorded for the new cards (they count as shown).
    const recs = await db.listingRecommendation.count({ where: { conversationId: turn.conversationId } });
    expect(recs).toBe(6);

    const last = await loadMoreMatches({ conversationId: turn.conversationId }, user);
    expect(last).toMatchObject({ ok: true, done: false });
    expect((last as typeof more & { message: typeof message }).message.parts[0].data.cards).toHaveLength(1);
    expect(await loadMoreMatches({ conversationId: turn.conversationId }, user)).toEqual({ ok: true, done: true });

    // A brief change starts again from the first page, labelled.
    const removed = await removeBriefItem({ conversationId: turn.conversationId, field: "budget" }, user);
    expect(removed.ok).toBe(true);
    const restarted = await loadMoreMatches({ conversationId: turn.conversationId }, user);
    expect((restarted as { message: { parts: { data: { updatedBrief?: boolean } }[] } }).message.parts[0].data.updatedBrief).toBe(true);
  });

  it("refuses during a reply and for strangers", async () => {
    const user = await visitor();
    const turn = await searchTurn(user);
    expect(await loadMoreMatches({ conversationId: turn.conversationId }, await visitor())).toEqual({ ok: false, reason: "not_found" });
    await db.conversation.update({ where: { id: turn.conversationId }, data: { turnStartedAt: new Date() } });
    expect(await loadMoreMatches({ conversationId: turn.conversationId }, user)).toEqual({ ok: false, reason: "turn_in_progress" });
  });
});

describe("AC-12: brief removal", () => {
  it("removes one area, saves the note, and the next turn sees it", async () => {
    const user = await visitor();
    const turn = await searchTurn(user);
    const result = await removeBriefItem({ conversationId: turn.conversationId, field: "areaIds", value: area.id }, user);
    expect(result).toMatchObject({ ok: true });
    const brief = await db.searchBrief.findUniqueOrThrow({ where: { conversationId: turn.conversationId } });
    expect(brief.areaIds).toEqual([]);

    const note = await db.chatMessage.findFirstOrThrow({ where: { conversationId: turn.conversationId, role: "SYSTEM" } });
    expect(note.textContent).toBe("You removed Conv Town from your brief.");

    const { model, prompts } = scriptedModel([{ text: "Noted." }]);
    await finishTurn(await runAssistantTurn(request(user, "ok", { conversationId: turn.conversationId }), { model, factSheet: "Facts." }));
    expect(JSON.stringify(prompts[0])).toContain("<note>You removed Conv Town from your brief.</note>");
  });

  it("writes the note in Bangla after a Bangla reply, and refuses unknown values", async () => {
    const user = await visitor();
    const { model } = scriptedModel([
      { tools: [{ name: "updateBrief", input: { areaSlugs: [area.slug] } }] },
      { text: "আপনার জন্য কিছু বাড়ি আছে।" },
    ]);
    const turn = await finishTurn(await runAssistantTurn(request(user, "বাড়ি চাই"), { model, factSheet: "Facts." }));
    expect(await removeBriefItem({ conversationId: turn.conversationId, field: "areaIds", value: uuidv7() }, user)).toEqual({
      ok: false,
      reason: "invalid",
    });
    await removeBriefItem({ conversationId: turn.conversationId, field: "areaIds", value: area.id }, user);
    const note = await db.chatMessage.findFirstOrThrow({ where: { conversationId: turn.conversationId, role: "SYSTEM" } });
    expect(note.textContent).toBe("আপনি আপনার চাহিদা থেকে কনভ সরিয়েছেন।");
  });
});

describe("AC-18, AC-13: current cards and starting points", () => {
  it("joins cards to current data and marks a sold listing unavailable", async () => {
    const extra = await createListing(agent, { areaId: area.id, publish: true, priceBdt: 30_000_000, latitude: 21, longitude: 89.5 });
    let cards = await chatCards([extra.id]);
    expect(cards[extra.id]).toMatchObject({ available: true, listing: { refCode: extra.refCode, priceBdt: 30_000_000 } });

    await db.listing.update({ where: { id: extra.id }, data: { priceBdt: BigInt(29_000_000) } });
    cards = await chatCards([extra.id]);
    expect(cards[extra.id]).toMatchObject({ listing: { priceBdt: 29_000_000 } });

    await transitionListing(extra.id, "SOLD", { id: agent.id, role: "AGENT" });
    cards = await chatCards([extra.id]);
    expect(cards[extra.id]).toEqual({ listingId: extra.id, available: false, title: extra.title });
  });

  it("reloads a conversation with its messages in order, cards, and brief", async () => {
    const user = await visitor();
    const turn = await searchTurn(user);
    const page = await loadConversationPage(turn.conversationId, user);
    expect(page?.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(Object.keys(page?.cards ?? {})).toHaveLength(3);
    expect(page?.briefItems.map((i) => i.label)).toEqual(["Up to BDT 20,000,000", "Conv Town"]);

    const sides = await chatSidePanes(turn.conversationId, user);
    expect(sides?.remaining).toBe(39);
    expect(await chatSidePanes(turn.conversationId, await visitor())).toBeNull();
  });

  it("finds a published starting listing by slug and ignores others", async () => {
    expect(await startListingBySlug(listings[1].slug)).toMatchObject({ slug: listings[1].slug, areaName: "Conv Town" });
    const draft = await createListing(agent, { areaId: area.id });
    expect(await startListingBySlug(draft.slug)).toBeNull();
    expect(await startListingBySlug("no-such-home")).toBeNull();
  });
});

describe("AC-14: fact sheet", () => {
  it("saves versions from the live one, refuses a stale save, and restores", async () => {
    const live = await liveFactSheet();
    const first = await saveFactSheet({ body: "Office hours: 10 to 6.", previousId: live?.id ?? null }, agent);
    expect(first.ok).toBe(true);
    const firstId = (first as { id: string }).id;

    // Two agents saving from the same version: exactly one lands.
    const [a, b] = await Promise.all([
      saveFactSheet({ body: "Version A", previousId: firstId }, agent),
      saveFactSheet({ body: "Version B", previousId: firstId }, agent),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect([a, b].find((r) => !r.ok)).toMatchObject({ reason: "stale" });

    const current = (await liveFactSheet())!;
    const restored = await restoreFactSheet({ versionId: firstId, previousId: current.id }, agent);
    expect(restored.ok).toBe(true);
    const versions = await factSheetVersions();
    expect(versions[0]).toMatchObject({ body: "Office hours: 10 to 6.", restored: true, author: "Fact Agent" });
  });

  it("refuses visitors, empty text, and over 4,000 characters", async () => {
    const live = (await liveFactSheet())!;
    expect(await saveFactSheet({ body: "x", previousId: live.id }, await visitor())).toEqual({ ok: false, reason: "forbidden" });
    expect(await saveFactSheet({ body: "  ", previousId: live.id }, agent)).toMatchObject({ ok: false, reason: "invalid" });
    expect(await saveFactSheet({ body: "x".repeat(4001), previousId: live.id }, agent)).toMatchObject({ ok: false, reason: "invalid" });
  });
});
