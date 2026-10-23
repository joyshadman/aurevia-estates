"use server";

import { z } from "zod";
import { chatCards, maxCardsPerLoad, type ChatCard } from "@/lib/server/assistant/cards";
import { getCurrentUser } from "@/lib/server/auth";

// Chat actions (spec 0006, *Conversations and fact sheet actions*).

// Current card data for listings a reply just showed (AC-18). A read, like
// `listConversations` in the spec's action table.
export async function loadChatCards(input: { listingIds: string[] }): Promise<Record<string, ChatCard>> {
  const user = await getCurrentUser();
  if (!user) return {};
  const parsed = z.object({ listingIds: z.array(z.uuid()).max(maxCardsPerLoad) }).safeParse(input);
  if (!parsed.success) return {};
  return chatCards(parsed.data.listingIds);
}
