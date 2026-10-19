"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth";
import { listSaved, savedForChat, savedListingIds, setSaved, type ChatSavedHome, type SavedPage, type SetSavedResult } from "@/lib/server/saved-homes";

// Saved homes actions (spec 0013). Public pages stay cached: hearts ask for
// their state from the client after hydration.

export async function savedListingIdsAction(): Promise<{ userId: string | null; ids: string[] }> {
  const user = await getCurrentUser();
  if (!user) return { userId: null, ids: [] };
  return { userId: user.id, ids: await savedListingIds(user) };
}

const saveInput = z.object({ listingId: z.uuid(), saved: z.boolean() });

export async function saveHomeAction(input: { listingId: string; saved: boolean }): Promise<SetSavedResult | { ok: false; reason: "signed_out" | "invalid" }> {
  const parsed = saveInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "signed_out" };
  return setSaved(user, parsed.data.listingId, parsed.data.saved);
}

export async function loadMoreSavedAction(cursor: string): Promise<SavedPage> {
  const user = await getCurrentUser();
  if (!user) return { items: [], nextCursor: null };
  return listSaved(user, z.string().max(200).parse(cursor));
}

export async function chatSavedAction(): Promise<ChatSavedHome[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  return savedForChat(user);
}
