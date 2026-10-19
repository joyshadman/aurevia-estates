import { beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/lib/server/auth";
import { loadMessages, saveMessage, saveMessages, type ChatMessageInput } from "@/lib/server/chat-store";
import { db } from "@/lib/server/db";
import { MessageIdConflictError } from "@/lib/server/errors";
import { uuidv7 } from "@/lib/server/uuid";
import { createConversation, createListing, createProfile } from "./support/fixtures";

// Spec 0002, AC-7: chat messages round trip with their AI SDK parts.

let visitor: Actor;
let listingIds: string[];

beforeAll(async () => {
  ({ actor: visitor } = await createProfile("VISITOR"));
  const { actor: agent } = await createProfile("AGENT");
  listingIds = [];
  for (let i = 0; i < 3; i++) listingIds.push((await createListing(agent, { publish: true })).id);
});

const userMessage = (text: string): ChatMessageInput => ({
  id: uuidv7(),
  role: "user",
  parts: [{ type: "text", text }],
});

const assistantMessage = (): ChatMessageInput => ({
  id: uuidv7(),
  role: "assistant",
  parts: [
    { type: "step-start" },
    {
      type: "tool-searchListings",
      toolCallId: "call_1",
      state: "output-available",
      input: { areaIds: [], maxPrice: 12_000_000, nested: { list: [1, 2, { deep: null }] } },
      output: { items: [{ slug: "a", priceBdt: 9_500_000 }] },
    },
    { type: "text", text: "Here are two homes." },
    { type: "text", text: "Both are in Zindabazar." },
  ],
  metadata: { model: "test", usage: { inputTokens: 10 } },
});

describe("AC-7: chat round trip", () => {
  it("reloads user and assistant messages saved in one transaction, in send order, with identical parts", async () => {
    const conversation = await createConversation(visitor);
    const user = userMessage("Find me a three bed flat under 1.2 crore in a quiet area near a good school please");
    const assistant = assistantMessage();
    await saveMessages(
      conversation.id,
      [{ message: user }, { message: assistant, recommendedListingIds: [listingIds[1], listingIds[0], listingIds[1]] }],
      visitor,
      "server",
    );

    const reloaded = await loadMessages(conversation.id, visitor);
    expect(reloaded).toEqual([user, assistant]);

    const rows = await db.chatMessage.findMany({ where: { conversationId: conversation.id }, orderBy: { seq: "asc" } });
    expect(rows.map((r) => r.id)).toEqual([user.id, assistant.id]);
    expect(rows[1].textContent).toBe("Here are two homes.\nBoth are in Zindabazar.");

    const saved = await db.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
    expect(saved.title).toBe("Find me a three bed flat under 1.2 crore in a quiet area nea");
    expect(saved.title!.length).toBeLessThanOrEqual(60);

    const recs = await db.listingRecommendation.findMany({ where: { messageId: assistant.id }, orderBy: { rank: "asc" } });
    expect(recs.map((r) => [r.listingId, r.rank])).toEqual([
      [listingIds[1], 0],
      [listingIds[0], 1],
    ]);
  });

  it("updates a message saved again under the same id, without duplicating it, and replaces its recommendations", async () => {
    const conversation = await createConversation(visitor);
    const assistant = assistantMessage();
    await saveMessage(conversation.id, assistant, visitor, { origin: "server", recommendedListingIds: [listingIds[0]] });

    const regenerated = { ...assistant, parts: [{ type: "text", text: "A better answer." }] };
    await saveMessage(conversation.id, regenerated, visitor, { origin: "server", recommendedListingIds: [listingIds[2]] });

    expect(await loadMessages(conversation.id, visitor)).toEqual([regenerated]);
    const recs = await db.listingRecommendation.findMany({ where: { messageId: assistant.id } });
    expect(recs.map((r) => r.listingId)).toEqual([listingIds[2]]);
  });

  it("keeps the first title", async () => {
    const conversation = await createConversation(visitor);
    await saveMessage(conversation.id, userMessage("First question"), visitor);
    await saveMessage(conversation.id, userMessage("Second question"), visitor);
    expect((await db.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).title).toBe("First question");
  });

  it("rejects a message id already used in another conversation", async () => {
    const first = await createConversation(visitor);
    const second = await createConversation(visitor);
    const message = userMessage("Hello");
    await saveMessage(first.id, message, visitor);
    await expect(saveMessage(second.id, message, visitor)).rejects.toBeInstanceOf(MessageIdConflictError);
    expect(await loadMessages(second.id, visitor)).toEqual([]);
  });

  it("rejects a write to another user's conversation", async () => {
    const { actor: stranger } = await createProfile("VISITOR");
    const conversation = await createConversation(visitor);
    await expect(saveMessage(conversation.id, userMessage("Hi"), stranger)).rejects.toThrow("Forbidden");
    await expect(loadMessages(conversation.id, stranger)).rejects.toThrow("Forbidden");
  });

  it("rejects a non USER role submitted by a client", async () => {
    const conversation = await createConversation(visitor);
    await expect(saveMessage(conversation.id, assistantMessage(), visitor)).rejects.toThrow(/only send user messages/);
    await expect(
      saveMessage(conversation.id, { id: uuidv7(), role: "system", parts: [] }, visitor),
    ).rejects.toThrow(/only send user messages/);
    expect(await db.chatMessage.count({ where: { conversationId: conversation.id } })).toBe(0);
  });

  it("removes messages, briefs, and recommendations when the conversation is deleted", async () => {
    const conversation = await createConversation(visitor);
    const assistant = assistantMessage();
    await saveMessage(conversation.id, assistant, visitor, { origin: "server", recommendedListingIds: [listingIds[0]] });
    await db.searchBrief.create({ data: { conversationId: conversation.id, minBedrooms: 3 } });

    await db.conversation.delete({ where: { id: conversation.id } });
    expect(await db.chatMessage.count({ where: { conversationId: conversation.id } })).toBe(0);
    expect(await db.searchBrief.count({ where: { conversationId: conversation.id } })).toBe(0);
    expect(await db.listingRecommendation.count({ where: { conversationId: conversation.id } })).toBe(0);
  });
});
