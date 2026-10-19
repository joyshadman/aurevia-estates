import { beforeAll, describe, expect, it } from "vitest";
import type { Brief } from "@/lib/domain/brief";
import { emptyBrief } from "@/lib/domain/brief";
import { dailyMessageLimit } from "@/lib/server/ai-usage";
import { createAssistantTools, type SearchListingsOutput } from "@/lib/server/assistant/tools";
import { runAssistantTurn, type TurnRequest } from "@/lib/server/assistant/turn";
import type { CurrentUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { loadAreaContext, searchCandidateListings } from "@/lib/server/listings";
import { uuidv7 } from "@/lib/server/uuid";
import { createConversation, createListing, createProfile } from "./support/fixtures";
import { finishTurn, scriptedModel, tokensPerStep } from "./support/mock-model";

// Spec 0006, milestone 1: candidate search, tools, and the turn without HTTP
// (AC-3, AC-4, AC-5, AC-6, AC-7, AC-9, AC-10, AC-15). The model is scripted.

let agent: CurrentUser;
// Test areas far from the seeded Sylhet areas, so seed listings never match.
let home: { id: string; slug: string };
let near: { id: string; slug: string };
let far: { id: string; slug: string };
let parking: { id: string; slug: string };
let exactA: { id: string; refCode: string };
let exactB: { id: string; refCode: string };
let nearby: { id: string; refCode: string };
let threeBed: { id: string; refCode: string };
let overBudget: { id: string; refCode: string };
let farAway: { id: string; refCode: string };
let draft: { id: string; refCode: string };

const tag = Date.now().toString(36);

async function area(name: string, lat: number) {
  return db.area.create({
    data: { slug: `t-${name}-${tag}`, nameEn: `T ${name}`, nameBn: name, centerLat: lat, centerLng: 90, sortOrder: 900 },
    select: { id: true, slug: true },
  });
}

async function visitor(): Promise<CurrentUser> {
  const { profile } = await createProfile("VISITOR");
  return { id: profile.id, email: profile.email, role: profile.role };
}

const userMessage = (text: string) => ({ id: uuidv7(), role: "user" as const, parts: [{ type: "text", text }] });

const request = (user: CurrentUser, text: string, extra: Partial<TurnRequest> = {}): TurnRequest => ({
  user,
  message: userMessage(text),
  locale: "en",
  trigger: "submit-message",
  ...extra,
});

const familyBrief = () => ({
  budgetMaxBdt: 25_000_000,
  areaSlugs: [home.slug],
  minBedrooms: 4,
  amenitySlugs: [parking.slug],
});

beforeAll(async () => {
  const { profile } = await createProfile("AGENT");
  agent = { id: profile.id, email: profile.email, role: profile.role };
  home = await area("home", 23.0);
  near = await area("near", 23.018); // about 2 km north
  far = await area("far", 23.09); // about 10 km north
  parking = await db.amenity.findUniqueOrThrow({ where: { slug: "car-parking" }, select: { id: true, slug: true } });

  const make = (data: Parameters<typeof createListing>[1]) =>
    createListing(agent, { publish: true, propertyType: "APARTMENT", amenityIds: [parking.id], ...data });
  exactA = await make({ areaId: home.id, priceBdt: 20_000_000, bedrooms: 4 });
  exactB = await make({ areaId: home.id, priceBdt: 22_000_000, bedrooms: 5 });
  nearby = await make({ areaId: near.id, priceBdt: 21_000_000, bedrooms: 4 });
  threeBed = await make({ areaId: home.id, priceBdt: 18_000_000, bedrooms: 3 });
  overBudget = await make({ areaId: home.id, priceBdt: 27_700_000, bedrooms: 4 });
  farAway = await make({ areaId: far.id, priceBdt: 20_000_000, bedrooms: 4 });
  draft = await createListing(agent, { areaId: home.id, priceBdt: 20_000_000, bedrooms: 4 });
});

describe("searchCandidateListings", () => {
  const brief = (patch: Partial<Brief>): Brief => ({ ...emptyBrief, ...patch });

  it("widens the brief: price band, nearby areas, one bedroom fewer", async () => {
    const areas = await loadAreaContext();
    const ids = (await searchCandidateListings(brief({ budgetMaxBdt: 25_000_000, areaIds: [home.id], minBedrooms: 4 }), areas)).map((l) => l.id);
    expect(ids).toEqual(expect.arrayContaining([exactA.id, exactB.id, nearby.id, threeBed.id, overBudget.id]));
    expect(ids).not.toContain(farAway.id);
    expect(ids).not.toContain(draft.id);
  });

  it("drops a price above the 15% band and a home two bedrooms short", async () => {
    const areas = await loadAreaContext();
    const ids = (await searchCandidateListings(brief({ budgetMaxBdt: 24_000_000, areaIds: [home.id], minBedrooms: 5 }), areas)).map((l) => l.id);
    expect(ids).not.toContain(overBudget.id); // 27.7M > 24M x 1.15
    expect(ids).not.toContain(threeBed.id);
  });
});

// Tool `execute` may return a stream type; these tools return plain values.
async function run<T>(value: T | AsyncIterable<T>): Promise<T> {
  return value as T;
}

describe("tools", () => {
  it("updateBrief maps slugs, drops unknown ones, and swaps a reversed budget", async () => {
    const user = await visitor();
    const conversation = await createConversation(user);
    const tools = createAssistantTools({ conversationId: conversation.id, shownListingIds: new Set() });
    const output = await run(await tools.updateBrief.execute!(
      { budgetMinBdt: 30_000_000, budgetMaxBdt: 10_000_000, areaSlugs: [home.slug, "atlantis"], minBedrooms: 3 },
      { toolCallId: "1", messages: [] } as never,
    ));
    expect(output.ignored).toEqual(["atlantis"]);
    expect(output.brief).toMatchObject({ budgetMinBdt: 10_000_000, budgetMaxBdt: 30_000_000, areaIds: [home.id], minBedrooms: 3 });

    // A later call replaces only the fields it passes.
    const next = await run(await tools.updateBrief.execute!({ minBedrooms: 4 }, { toolCallId: "2", messages: [] } as never));
    expect(next.brief).toMatchObject({ budgetMaxBdt: 30_000_000, areaIds: [home.id], minBedrooms: 4 });
  });

  it("getListingDetails answers only for shown listings", async () => {
    const user = await visitor();
    const conversation = await createConversation(user);
    const shown = new Set<string>();
    const tools = createAssistantTools({ conversationId: conversation.id, shownListingIds: shown });
    const options = { toolCallId: "1", messages: [] } as never;

    expect(await tools.getListingDetails.execute!({ refCode: exactA.refCode }, options)).toEqual({ error: "not_shown" });
    shown.add(exactA.id);
    const details = await tools.getListingDetails.execute!({ refCode: exactA.refCode.toLowerCase() }, options);
    expect(details).toMatchObject({ status: "available", listing: { refCode: exactA.refCode, bedrooms: 4 } });
    expect(JSON.stringify(details)).not.toMatch(/whatsapp|phone|email/i);

    shown.add(draft.id);
    expect(await tools.getListingDetails.execute!({ refCode: draft.refCode }, options)).toMatchObject({ status: "unavailable" });
  });
});

describe("runAssistantTurn", () => {
  it("fills the brief, ranks homes, and saves the whole turn", async () => {
    const user = await visitor();
    const { model } = scriptedModel([
      { tools: [{ name: "updateBrief", input: familyBrief() }] },
      { tools: [{ name: "searchListings", input: {} }] },
      { text: `Here are homes that fit. ${exactA.refCode} has everything you asked for.` },
    ]);
    const result = await finishTurn(await runAssistantTurn(request(user, "Family of five, up to 2.5 crore, 4 bedrooms, parking"), { model, factSheet: "Office hours: 10 to 6." }));

    expect(result.outcome).toBe("finished");
    expect(result.ungrounded).toEqual([]);
    expect(result.usage).toEqual({ inputTokens: 3 * tokensPerStep.input, outputTokens: 3 * tokensPerStep.output });
    expect(result.remaining).toBe(dailyMessageLimit - 1);

    const search = result.message.parts.find((p) => p.type === "tool-searchListings") as unknown as { output: SearchListingsOutput };
    // Two exact matches (newest first), then the 89% ties: the newer one leads.
    expect(search.output.cards.map((c) => c.listingId)).toEqual([exactB.id, exactA.id, threeBed.id]);
    expect(search.output.cards[2]).toMatchObject({ exact: false, differs: ["3 bedrooms, you asked for 4"] });
    expect(search.output).toMatchObject({ exactCount: 2, hasMore: true });

    const conversation = await db.conversation.findUniqueOrThrow({
      where: { id: result.conversationId },
      include: { messages: { orderBy: { seq: "asc" } }, recommendations: { orderBy: { rank: "asc" } }, brief: true },
    });
    expect(conversation.turnStartedAt).toBeNull();
    expect(conversation.messages.map((m) => m.role)).toEqual(["USER", "ASSISTANT"]);
    expect(conversation.messages[1].metadata).toMatchObject({ locale: "en", results: { nextPage: 1 } });
    expect(conversation.recommendations.map((r) => r.listingId)).toEqual([exactB.id, exactA.id, threeBed.id]);
    expect(search.output.cards.find((c) => c.listingId === nearby.id)).toBeUndefined();
    expect(conversation.brief).toMatchObject({ minBedrooms: 4, areaIds: [home.id] });

    const [usage] = await db.aiUsageDaily.findMany({ where: { userId: user.id } });
    expect(usage).toMatchObject({ messageCount: 1, inputTokens: 3 * tokensPerStep.input });
  });

  it("passes the brief and the fact sheet to the model, and continues a conversation", async () => {
    const user = await visitor();
    const first = scriptedModel([{ tools: [{ name: "updateBrief", input: { minBedrooms: 3 } }] }, { text: "Noted." }]);
    const { conversationId } = await finishTurn(await runAssistantTurn(request(user, "3 bedrooms"), { model: first.model }));

    const second = scriptedModel([{ text: "Our office is open 10 to 6." }]);
    await finishTurn(
      await runAssistantTurn(request(user, "When are you open?", { conversationId }), { model: second.model, factSheet: "Office hours: 10 to 6." }),
    );
    const prompt = JSON.stringify(second.prompts[0]);
    expect(prompt).toContain("Office hours: 10 to 6.");
    expect(prompt).toContain('\\"minBedrooms\\":3');
    expect(prompt).toContain("3 bedrooms");
  });

  it("flags a reply that names a listing it never showed", async () => {
    const user = await visitor();
    const { model } = scriptedModel([{ text: `You might like ${farAway.refCode}.` }]);
    const result = await finishTurn(await runAssistantTurn(request(user, "Anything?"), { model }));
    expect(result.ungrounded).toEqual([farAway.refCode]);
    expect(result.message.metadata).toMatchObject({ ungrounded: true });
  });

  it("refuses at the daily limit without saving anything; agents are never limited", async () => {
    const user = await visitor();
    await db.aiUsageDaily.create({
      data: { userId: user.id, day: new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" })), messageCount: dailyMessageLimit },
    });
    const { model, calls } = scriptedModel([{ text: "Hi" }]);
    const refused = await runAssistantTurn(request(user, "Hello"), { model });
    expect(refused).toMatchObject({ ok: false, status: 429, reason: "daily_limit" });
    expect(calls()).toBe(0);
    expect(await db.conversation.count({ where: { userId: user.id } })).toBe(0);

    const result = await finishTurn(await runAssistantTurn(request(agent, "Hello"), { model }));
    expect(result.remaining).toBeNull();
  });

  it("allows exactly one of several parallel sends at the last slot", async () => {
    const user = await visitor();
    await db.aiUsageDaily.create({
      data: { userId: user.id, day: new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" })), messageCount: dailyMessageLimit - 1 },
    });
    const { model } = scriptedModel([{ text: "Hi" }]);
    const attempts = await Promise.all([1, 2, 3].map((n) => runAssistantTurn(request(user, `Hello ${n}`), { model })));
    expect(attempts.filter((a) => a.ok)).toHaveLength(1);
    await finishTurn(attempts.find((a) => a.ok)!);
  });

  it("guards one reply per conversation, duplicate ids, and ownership", async () => {
    const user = await visitor();
    const slow = scriptedModel([{ text: "a slow reply that takes a while", chunks: 10, delayMs: 50 }]);
    const running = await runAssistantTurn(request(user, "First"), { model: slow.model });
    if (!running.ok) throw new Error("expected the first turn to start");
    const { conversationId } = running;

    const quick = scriptedModel([{ text: "Hi" }]);
    expect(await runAssistantTurn(request(user, "Second", { conversationId }), { model: quick.model })).toMatchObject({
      status: 409,
      reason: "turn_in_progress",
    });
    await finishTurn(running);

    const message = userMessage("Again");
    await finishTurn(await runAssistantTurn({ ...request(user, ""), conversationId, message }, { model: quick.model }));
    expect(await runAssistantTurn({ ...request(user, ""), conversationId, message }, { model: quick.model })).toMatchObject({
      status: 409,
      reason: "duplicate_message",
    });

    const stranger = await visitor();
    expect(await runAssistantTurn(request(stranger, "Mine?", { conversationId }), { model: quick.model })).toMatchObject({
      status: 404,
    });
    // Refused turns return their slot.
    const [usage] = await db.aiUsageDaily.findMany({ where: { userId: user.id } });
    expect(usage.messageCount).toBe(2);
  });

  it("saves a failed reply as interrupted, refunds it, and retries it in place", async () => {
    const user = await visitor();
    const failing = scriptedModel([{ text: "Let me look", error: "provider exploded" }]);
    const failed = await finishTurn(await runAssistantTurn(request(user, "Find me a flat"), { model: failing.model }));
    expect(failed.outcome).toBe("interrupted");
    expect(failed.message.metadata).toMatchObject({ interrupted: true });
    let [usage] = await db.aiUsageDaily.findMany({ where: { userId: user.id } });
    expect(usage.messageCount).toBe(0);

    const ok = scriptedModel([{ text: "Here you go." }]);
    // Retry only works on the latest interrupted reply.
    const retried = await finishTurn(
      await runAssistantTurn(
        { ...request(user, ""), conversationId: failed.conversationId, trigger: "regenerate-message", regenerateMessageId: failed.message.id },
        { model: ok.model },
      ),
    );
    expect(retried.outcome).toBe("finished");
    expect(retried.message.id).toBe(failed.message.id);
    const messages = await db.chatMessage.findMany({ where: { conversationId: failed.conversationId } });
    expect(messages).toHaveLength(2);
    [usage] = await db.aiUsageDaily.findMany({ where: { userId: user.id } });
    expect(usage.messageCount).toBe(1);

    expect(
      await runAssistantTurn(
        { ...request(user, ""), conversationId: failed.conversationId, trigger: "regenerate-message", regenerateMessageId: failed.message.id },
        { model: ok.model },
      ),
    ).toMatchObject({ status: 409, reason: "not_retryable" });
  });

  it("marks a reply cut at the output limit as interrupted", async () => {
    const user = await visitor();
    const { model } = scriptedModel([{ text: "This is very long", finish: "length" }]);
    const result = await finishTurn(await runAssistantTurn(request(user, "Tell me everything"), { model }));
    expect(result.outcome).toBe("interrupted");
  });

  it("stops a reply when asked, keeps the slot, and saves it as stopped", async () => {
    const user = await visitor();
    const { model } = scriptedModel([{ text: "word ".repeat(60), chunks: 60, delayMs: 50 }]);
    const started = await runAssistantTurn(request(user, "Go on"), { model });
    if (!started.ok) throw new Error("expected the turn to start");
    // Prisma queries are lazy: `.then` sends it.
    setTimeout(() => {
      db.$executeRaw`UPDATE conversations SET stop_requested_at = now() WHERE id = ${started.conversationId}::uuid`.then(() => undefined);
    }, 300);
    const result = await finishTurn(started);
    expect(result.outcome).toBe("stopped");
    expect(result.message.metadata).toMatchObject({ stopped: true });
    const [usage] = await db.aiUsageDaily.findMany({ where: { userId: user.id } });
    expect(usage.messageCount).toBe(1);
  });

  it("ties a new chat to a published starting listing and ignores an unpublished one", async () => {
    const user = await visitor();
    const published = await db.listing.findUniqueOrThrow({ where: { id: exactA.id }, select: { slug: true } });
    const { model, prompts } = scriptedModel([{ text: "Happy to help." }]);
    const result = await finishTurn(await runAssistantTurn(request(user, "Tell me more", { startListingSlug: published.slug }), { model }));
    const conversation = await db.conversation.findUniqueOrThrow({ where: { id: result.conversationId } });
    expect(conversation.startListingId).toBe(exactA.id);
    expect(JSON.stringify(prompts[0])).toContain("starting_listing");

    const unpublished = await db.listing.findUniqueOrThrow({ where: { id: draft.id }, select: { slug: true } });
    const other = await finishTurn(await runAssistantTurn(request(user, "And this?", { startListingSlug: unpublished.slug }), { model }));
    expect((await db.conversation.findUniqueOrThrow({ where: { id: other.conversationId } })).startListingId).toBeNull();
  });

  it("rejects an empty or too long message", async () => {
    const user = await visitor();
    const { model } = scriptedModel([{ text: "Hi" }]);
    expect(await runAssistantTurn(request(user, "   "), { model })).toMatchObject({ status: 400 });
    expect(await runAssistantTurn(request(user, "x".repeat(2001)), { model })).toMatchObject({ status: 400 });
  });
});
