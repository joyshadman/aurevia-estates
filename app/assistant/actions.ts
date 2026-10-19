"use server";

import { getCurrentUser } from "@/lib/server/auth";
import * as conversations from "@/lib/server/conversations";

// Chat actions around the streaming turn (spec 0006). Each one reads the session
// itself; the service checks ownership under the conversation row lock and
// answers `not_found` for anything that isn't the user's (AC-11).

const signedOut = { ok: false as const, reason: "signed_out" as const };

export async function renameConversationAction(input: { id: string; title: string }) {
  const user = await getCurrentUser();
  if (!user) return signedOut;
  return conversations.renameConversation(input, user);
}

export async function deleteConversationAction(input: { id: string }) {
  const user = await getCurrentUser();
  if (!user) return signedOut;
  return conversations.deleteConversation(input, user);
}

export async function removeBriefItemAction(input: { conversationId: string; field: string; value?: string }) {
  const user = await getCurrentUser();
  if (!user) return signedOut;
  const result = await conversations.removeBriefItem(input, user);
  if (!result.ok) return result;
  return { ok: true as const, message: result.message, briefItems: await conversations.briefItems(result.brief) };
}

export async function loadMoreMatchesAction(input: { conversationId: string }) {
  const user = await getCurrentUser();
  if (!user) return signedOut;
  const result = await conversations.loadMoreMatches(input, user);
  if (!result.ok || result.done) return result;
  const cards = await conversations.chatCards(conversations.cardIdsIn([result.message]));
  return { ...result, cards };
}

// Current card data for listings a streamed reply just showed (AC-18). Public
// listing data only; unpublished ones come back as unavailable.
export async function chatCardsAction(listingIds: string[]) {
  const user = await getCurrentUser();
  if (!user || !Array.isArray(listingIds)) return {};
  return conversations.chatCards(listingIds.filter((id): id is string => typeof id === "string"));
}

export async function chatSidePanesAction(conversationId: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  return conversations.chatSidePanes(String(conversationId), user);
}

export async function listConversationsAction(cursor?: string) {
  const user = await getCurrentUser();
  if (!user) return { rows: [], nextCursor: null };
  return conversations.listConversations(user, typeof cursor === "string" ? cursor : undefined);
}
