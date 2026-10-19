import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { ForbiddenError, type Actor } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { MessageIdConflictError } from "@/lib/server/errors";

// Chat persistence (spec 0002, AC-7). One row per AI SDK message, `parts` stored
// as is, read back in send order (`seq`).

// The fields of the AI SDK `UIMessage` this store needs. The AI SDK arrives with
// feature 7; a `UIMessage` satisfies this shape.
export type ChatMessageInput = {
  id: string;
  role: "system" | "user" | "assistant";
  parts: ({ type: string } & Record<string, unknown>)[];
  metadata?: unknown;
};

export type SaveEntry = {
  message: ChatMessageInput;
  // Assistant messages only: listing ids from the message's search tool results,
  // in first seen order. Rank is the position after removing repeats.
  recommendedListingIds?: string[];
};

// `client`: a request body, which may only carry USER messages.
// `server`: the chat route saving the assistant reply on finish.
export type SaveOrigin = "client" | "server";

const roles = { user: "USER", assistant: "ASSISTANT", system: "SYSTEM" } as const;
const titleLength = 60;

export function textContent(parts: ChatMessageInput["parts"]): string {
  return parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("\n");
}

async function assertOwnsConversation(tx: Prisma.TransactionClient, conversationId: string, actor: Actor) {
  const conversation = await tx.conversation.findFirst({
    where: { id: conversationId, userId: actor.id },
    select: { id: true },
  });
  if (!conversation) throw new ForbiddenError();
}

async function saveOne(tx: Prisma.TransactionClient, conversationId: string, entry: SaveEntry, origin: SaveOrigin) {
  const { message } = entry;
  const role = roles[message.role];
  if (!role) throw new ForbiddenError(`Unknown message role: ${message.role}`);
  if (origin === "client" && role !== "USER") throw new ForbiddenError("Clients may only send user messages");

  const text = textContent(message.parts);
  const metadata = message.metadata === undefined ? null : JSON.stringify(message.metadata);

  // An id that already exists in another conversation (or with another role)
  // returns no row: ids belong to one conversation forever.
  const saved = await tx.$queryRaw<{ id: string; seq: bigint }[]>`
    INSERT INTO chat_messages (id, conversation_id, role, parts, text_content, metadata, created_at)
    VALUES (${message.id}, ${conversationId}::uuid, ${role}::message_role, ${JSON.stringify(message.parts)}::jsonb,
            ${text}, ${metadata}::jsonb, now())
    ON CONFLICT (id) DO UPDATE
      SET parts = excluded.parts, text_content = excluded.text_content, metadata = excluded.metadata
      WHERE chat_messages.conversation_id = excluded.conversation_id AND chat_messages.role = excluded.role
    RETURNING id, seq`;
  if (saved.length === 0) throw new MessageIdConflictError(message.id);

  const title = role === "USER" ? text.trim().slice(0, titleLength).trim() || null : null;
  await tx.$executeRaw`
    UPDATE conversations
    SET last_message_at = now(), updated_at = now(), title = COALESCE(title, ${title})
    WHERE id = ${conversationId}::uuid`;

  if (role === "ASSISTANT") {
    await tx.listingRecommendation.deleteMany({ where: { messageId: message.id } });
    const listingIds = [...new Set(entry.recommendedListingIds ?? [])];
    if (listingIds.length > 0) {
      await tx.listingRecommendation.createMany({
        data: listingIds.map((listingId, rank) => ({ conversationId, messageId: message.id, listingId, rank })),
      });
    }
  }
  return saved[0];
}

// Saves the messages in order, in one transaction, so `seq` follows send order.
export async function saveMessages(
  conversationId: string,
  entries: SaveEntry[],
  actor: Actor,
  origin: SaveOrigin = "client",
) {
  return db.$transaction(async (tx) => {
    await assertOwnsConversation(tx, conversationId, actor);
    const saved = [];
    for (const entry of entries) saved.push(await saveOne(tx, conversationId, entry, origin));
    return saved;
  });
}

export async function saveMessage(
  conversationId: string,
  message: ChatMessageInput,
  actor: Actor,
  options: { origin?: SaveOrigin; recommendedListingIds?: string[] } = {},
) {
  const [saved] = await saveMessages(
    conversationId,
    [{ message, recommendedListingIds: options.recommendedListingIds }],
    actor,
    options.origin,
  );
  return saved;
}

// Reloads a conversation's messages in send order, in `UIMessage` shape.
export async function loadMessages(conversationId: string, actor: Actor): Promise<ChatMessageInput[]> {
  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, userId: actor.id },
    select: { messages: { orderBy: { seq: "asc" } } },
  });
  if (!conversation) throw new ForbiddenError();
  return conversation.messages.map((row) => ({
    id: row.id,
    role: row.role.toLowerCase() as ChatMessageInput["role"],
    parts: row.parts as ChatMessageInput["parts"],
    ...(row.metadata === null ? {} : { metadata: row.metadata }),
  }));
}

// ---------------------------------------------------------------------------
// Server written messages (spec 0006). Every caller holds the conversation row
// lock (`select ... for update`) inside `tx`.

type CardsOutput = { cards?: { listingId?: unknown }[] };

// Listing ids shown by a message: its search tool results and Show more parts,
// in first seen order.
export function shownListingIds(parts: ChatMessageInput["parts"]): string[] {
  const ids: string[] = [];
  for (const part of parts) {
    let output: CardsOutput | undefined;
    if (part.type === "tool-searchListings" && part.state === "output-available") output = part.output as CardsOutput;
    if (part.type === "data-matches") output = part.data as CardsOutput;
    for (const card of output?.cards ?? []) if (typeof card.listingId === "string") ids.push(card.listingId);
  }
  return [...new Set(ids)];
}

// ASSISTANT and SYSTEM messages only; never reachable from client input. An
// ASSISTANT message's recommendation rows are replaced from its parts.
export async function saveServerMessage(tx: Prisma.TransactionClient, conversationId: string, message: ChatMessageInput) {
  if (message.role === "user") throw new ForbiddenError("Server messages are assistant or system messages");
  const recommendedListingIds = message.role === "assistant" ? shownListingIds(message.parts) : undefined;
  return saveOne(tx, conversationId, { message, recommendedListingIds }, "server");
}

// Inserts a visitor's message only when its id is new. Returns false when the id
// already exists anywhere (a resend), so the turn can refuse it.
export async function insertUserMessage(tx: Prisma.TransactionClient, conversationId: string, message: ChatMessageInput) {
  if (message.role !== "user") throw new ForbiddenError("Clients may only send user messages");
  const text = textContent(message.parts);
  const inserted = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO chat_messages (id, conversation_id, role, parts, text_content, metadata, created_at)
    VALUES (${message.id}, ${conversationId}::uuid, 'USER'::message_role, ${JSON.stringify(message.parts)}::jsonb,
            ${text}, ${message.metadata === undefined ? null : JSON.stringify(message.metadata)}::jsonb, now())
    ON CONFLICT (id) DO NOTHING
    RETURNING id`;
  if (inserted.length === 0) return false;
  const title = text.trim().slice(0, titleLength).trim() || null;
  await tx.$executeRaw`
    UPDATE conversations
    SET last_message_at = now(), updated_at = now(), title = COALESCE(title, ${title})
    WHERE id = ${conversationId}::uuid`;
  return true;
}
