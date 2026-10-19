import "server-only";
import { findUngrounded } from "@/lib/domain/chat-text";
import type { Prisma } from "@/lib/generated/prisma/client";

// The grounding check (spec 0006, AC-15), run when a reply is saved: a code or a
// long title the conversation never showed flags the reply as ungrounded.

type Client = Pick<Prisma.TransactionClient, "listing">;

export async function checkGrounding(client: Client, text: string, shownListingIds: Set<string>): Promise<string[]> {
  if (!text.trim()) return [];
  const [shown, published] = await Promise.all([
    client.listing.findMany({ where: { id: { in: [...shownListingIds] } }, select: { refCode: true } }),
    client.listing.findMany({ where: { status: "PUBLISHED" }, select: { refCode: true, title: true } }),
  ]);
  return findUngrounded(text, new Set(shown.map((l) => l.refCode)), published);
}
