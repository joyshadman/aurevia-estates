import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { Actor } from "@/lib/server/auth";
import { ForbiddenError } from "@/lib/server/errors";
import { db } from "@/lib/server/db";
import { DuplicateMessageError, MessageIdConflictError } from "@/lib/server/errors";

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

async function saveOne(
  tx: Prisma.TransactionClient,
  conversationId: string,
  entry: SaveEntry,
  origin: SaveOrigin,
  { insertOnly = false } = {},
) {
  const { message } = entry;
  const role = roles[message.role];
  if (!role) throw new ForbiddenError(`Unknown message role: ${message.role}`);
  if (origin === "client" && role !== "USER") throw new ForbiddenError("Clients may only send user messages");

  const text = textContent(message.parts);
  const metadata = message.metadata === undefined ? null : JSON.stringify(message.metadata);
  const parts = JSON.stringify(message.parts);

  // Upsert: an id that already exists in another conversation (or with another
  // role) returns no row, so ids belong to one conversation forever. Insert only:
  // any existing id returns no row.
  const saved = insertOnly
    ? await tx.$queryRaw<{ id: string; seq: bigint }[]>`
        INSERT INTO chat_messages (id, conversation_id, role, parts, text_content, metadata, created_at)
        VALUES (${message.id}, ${conversationId}::uuid, ${role}::message_role, ${parts}::jsonb,
                ${text}, ${metadata}::jsonb, now())
        ON CONFLICT (id) DO NOTHING
        RETURNING id, seq`
    : await tx.$queryRaw<{ id: string; seq: bigint }[]>`
        INSERT INTO chat_messages (id, conversation_id, role, parts, text_content, metadata, created_at)
        VALUES (${message.id}, ${conversationId}::uuid, ${role}::message_role, ${parts}::jsonb,
                ${text}, ${metadata}::jsonb, now())
        ON CONFLICT (id) DO UPDATE
          SET parts = excluded.parts, text_content = excluded.text_content, metadata = excluded.metadata
          WHERE chat_messages.conversation_id = excluded.conversation_id AND chat_messages.role = excluded.role
        RETURNING id, seq`;
  if (saved.length === 0) throw insertOnly ? new DuplicateMessageError(message.id) : new MessageIdConflictError(message.id);

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

// ---------------------------------------------------------------------------
// The assistant chat turn (spec 0006). Every caller holds the conversation row
// lock (`SELECT ... FOR UPDATE`) in `tx`.

// The visitor's new message: insert only, so a repeated id is refused with
// `DuplicateMessageError` instead of overwriting history.
export async function saveNewUserMessage(tx: Prisma.TransactionClient, conversationId: string, message: ChatMessageInput) {
  return saveOne(tx, conversationId, { message }, "client", { insertOnly: true });
}

type MatchesOutput = { cards?: { listingId?: unknown }[] };

// Listing ids a message shows, in first seen order: the cards of finished
// `tool-searchListings` parts and of `data-matches` parts (Show more).
export function shownListingIds(parts: ChatMessageInput["parts"]): string[] {
  const ids: string[] = [];
  for (const part of parts) {
    const output =
      part.type === "tool-searchListings" && part.state === "output-available"
        ? (part.output as MatchesOutput | undefined)
        : part.type === "data-matches"
          ? (part.data as MatchesOutput | undefined)
          : undefined;
    for (const card of output?.cards ?? []) if (typeof card.listingId === "string") ids.push(card.listingId);
  }
  return [...new Set(ids)];
}

// ASSISTANT and SYSTEM messages written by the server, never from client input.
// Upserts by id within the conversation and replaces an assistant message's
// recommendation rows from the cards it shows.
export async function saveServerMessage(tx: Prisma.TransactionClient, conversationId: string, message: ChatMessageInput) {
  if (message.role === "user") throw new ForbiddenError("Server messages are assistant or system messages");
  const recommendedListingIds = message.role === "assistant" ? shownListingIds(message.parts) : undefined;
  return saveOne(tx, conversationId, { message, recommendedListingIds }, "server");
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
