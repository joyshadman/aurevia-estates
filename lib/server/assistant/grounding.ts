import "server-only";
import { normalizeBanglaDigits } from "@/lib/domain/bangla";
import type { Prisma } from "@/lib/generated/prisma/client";

// The grounding check (spec 0006, AC-4, AC-15): does a finished reply name a
// listing the conversation never showed? Run after the fact; the reply is still
// shown, and the eval holds the model to zero failures.

type Client = Pick<Prisma.TransactionClient, "listing" | "listingRecommendation" | "conversation">;

const minTitleLength = 20;

// Listings the conversation may talk about: every recommendation plus its
// starting listing. `extraIds` covers cards shown in the turn being saved.
export async function shownListingIdsFor(client: Client, conversationId: string, extraIds: string[] = []) {
  const [recommendations, conversation] = await Promise.all([
    client.listingRecommendation.findMany({ where: { conversationId }, select: { listingId: true } }),
    client.conversation.findUnique({ where: { id: conversationId }, select: { startListingId: true } }),
  ]);
  const ids = new Set([...recommendations.map((row) => row.listingId), ...extraIds]);
  if (conversation?.startListingId) ids.add(conversation.startListingId);
  return ids;
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Returns the offending ref codes and titles; empty means grounded.
export async function checkGrounding(client: Client, text: string, shownIds: Set<string>) {
  const normalized = normalizeBanglaDigits(text);
  const codes = [...new Set((normalized.match(/AUR-\d{4,}/gi) ?? []).map((code) => code.toUpperCase()))];

  const shown = await client.listing.findMany({ where: { id: { in: [...shownIds] } }, select: { refCode: true } });
  const shownCodes = new Set(shown.map((row) => row.refCode));
  const unshownCodes = codes.filter((code) => !shownCodes.has(code));

  // Long titles only: short ones ("Garden House") collide with ordinary words.
  const published = await client.listing.findMany({
    where: { status: "PUBLISHED", id: { notIn: [...shownIds] } },
    select: { refCode: true, title: true },
  });
  const lower = normalized.toLowerCase();
  const unshownTitles = published
    .filter((row) => row.title.length >= minTitleLength)
    .filter((row) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(row.title.toLowerCase())}($|[^\\p{L}\\p{N}])`, "u").test(lower))
    .map((row) => row.refCode);

  return [...new Set([...unshownCodes, ...unshownTitles])];
}
