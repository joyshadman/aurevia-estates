"use server";

import { z } from "zod";
import { briefFields, loadMoreMatches as loadMore, removeBriefItem as removeItem } from "@/lib/server/assistant/chat-edits";
import { chatCards, maxCardsPerLoad, type ChatCard } from "@/lib/server/assistant/cards";
import type { BriefView } from "@/lib/server/assistant/brief";
import type { AssistantUIMessage } from "@/lib/server/assistant/history";
import { getCurrentUser } from "@/lib/server/auth";
import * as conversations from "@/lib/server/conversations";
import { ForbiddenError } from "@/lib/server/errors";
import type { ChatEditReason } from "./messages";

// Chat actions (spec 0006, *Conversations and fact sheet actions*). Each reads
// the user first (`refresh: true`, spec 0008) and returns `{ ok: false, reason }`
// instead of throwing; another user's conversation is `not_found` (AC-11).

type Failure = { ok: false; reason: ChatEditReason };

const uuid = z.uuid();

async function currentUser() {
  return getCurrentUser({ refresh: true });
}

// Current card data for listings a reply just showed (AC-18). A read, like
// `listConversations` in the spec's action table.
export async function loadChatCards(input: { listingIds: string[] }): Promise<Record<string, ChatCard>> {
  const user = await getCurrentUser();
  if (!user) return {};
  const parsed = z.object({ listingIds: z.array(z.uuid()).max(maxCardsPerLoad) }).safeParse(input);
  if (!parsed.success) return {};
  return chatCards(parsed.data.listingIds);
}

// The next 20 conversations ("Load more").
export async function listConversations(input: { cursor?: string }): Promise<({ ok: true } & conversations.ConversationPage) | Failure> {
  const user = await currentUser();
  if (!user) return { ok: false, reason: "signed_out" };
  const cursor = z.string().max(200).optional().safeParse(input.cursor);
  return { ok: true, ...(await conversations.listConversations(user, cursor.success ? cursor.data : undefined)) };
}

export async function renameConversation(input: { id: string; title: string }): Promise<{ ok: true; title: string } | Failure> {
  const user = await currentUser();
  if (!user) return { ok: false, reason: "signed_out" };
  if (!uuid.safeParse(input.id).success) return { ok: false, reason: "not_found" };
  const title = z.string().trim().min(1).max(conversations.maxTitleLength).safeParse(input.title);
  if (!title.success) return { ok: false, reason: "invalid" };
  try {
    await conversations.renameConversation(user, input.id, title.data);
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, reason: "not_found" };
    throw error;
  }
  return { ok: true, title: title.data };
}

export async function deleteConversation(input: { id: string }): Promise<{ ok: true } | Failure> {
  const user = await currentUser();
  if (!user) return { ok: false, reason: "signed_out" };
  if (!uuid.safeParse(input.id).success) return { ok: false, reason: "not_found" };
  return conversations.deleteConversation(user, input.id);
}

const removeInput = z.object({
  conversationId: uuid,
  field: z.enum(briefFields),
  value: z.string().max(100).optional(),
});

// AC-12: doesn't count toward the limit; refused while a reply streams.
export async function removeBriefItem(
  input: z.input<typeof removeInput>,
): Promise<{ ok: true; brief: BriefView; message: AssistantUIMessage } | Failure> {
  const user = await currentUser();
  if (!user) return { ok: false, reason: "signed_out" };
  const parsed = removeInput.safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues[0]?.path[0] === "conversationId" ? { ok: false, reason: "not_found" } : { ok: false, reason: "invalid" };
  }
  return removeItem(user, parsed.data);
}

// AC-4: the next 3 homes, without the model and without the limit.
export async function loadMoreMatches(input: {
  conversationId: string;
}): Promise<{ ok: true; message: AssistantUIMessage; cards: Record<string, ChatCard> } | { ok: true; done: true } | Failure> {
  const user = await currentUser();
  if (!user) return { ok: false, reason: "signed_out" };
  if (!uuid.safeParse(input.conversationId).success) return { ok: false, reason: "not_found" };
  return loadMore(user, input.conversationId);
}
