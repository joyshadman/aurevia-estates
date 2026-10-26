import "server-only";
import { z } from "zod";
import type { Actor } from "@/lib/server/auth";
import { lockIdleConversation } from "@/lib/server/chat-store";
import { db } from "@/lib/server/db";
import { ForbiddenError } from "@/lib/server/errors";

// The visitor's conversation list, rename, and delete (spec 0006, AC-11,
// *Conversations and fact sheet actions*). Another user's conversation is
// `ForbiddenError`, which the caller shows as not found.

export const conversationPageSize = 20;
export const maxTitleLength = 60;

export type ConversationRow = { id: string; title: string | null; lastMessageAt: string };

export type ConversationPage = { rows: ConversationRow[]; nextCursor: string | null };

const cursorShape = z.object({ at: z.iso.datetime(), id: z.uuid() });

function encodeCursor(row: ConversationRow): string {
  return Buffer.from(JSON.stringify({ at: row.lastMessageAt, id: row.id })).toString("base64url");
}

function decodeCursor(cursor: string): z.infer<typeof cursorShape> | null {
  try {
    const parsed = cursorShape.safeParse(JSON.parse(Buffer.from(cursor, "base64url").toString()));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// Newest first, keyset on `last_message_at desc, id desc`. A cursor that
// doesn't parse starts from the top.
export async function listConversations(actor: Actor, cursor?: string): Promise<ConversationPage> {
  const after = cursor ? decodeCursor(cursor) : null;
  const rows = await db.conversation.findMany({
    where: {
      userId: actor.id,
      ...(after
        ? {
            OR: [
              { lastMessageAt: { lt: new Date(after.at) } },
              { lastMessageAt: new Date(after.at), id: { lt: after.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
    take: conversationPageSize + 1,
    select: { id: true, title: true, lastMessageAt: true },
  });
  const page = rows.slice(0, conversationPageSize).map((row) => ({
    id: row.id,
    title: row.title,
    lastMessageAt: row.lastMessageAt.toISOString(),
  }));
  return { rows: page, nextCursor: rows.length > conversationPageSize ? encodeCursor(page.at(-1)!) : null };
}

// One statement, so the row lock lasts only for the update.
export async function renameConversation(actor: Actor, id: string, title: string) {
  const { count } = await db.conversation.updateMany({ where: { id, userId: actor.id }, data: { title } });
  if (count === 0) throw new ForbiddenError();
}

// Removes the conversation with its messages, brief, and recommendations (they
// cascade). Leads and viewings booked from it stay, with a null conversation.
export async function deleteConversation(actor: Actor, id: string): Promise<{ ok: true } | { ok: false; reason: "not_found" | "turn_in_progress" }> {
  return db.$transaction(async (tx) => {
    const refused = await lockIdleConversation(tx, id, actor);
    if (refused) return { ok: false, reason: refused };
    await tx.conversation.delete({ where: { id } });
    return { ok: true };
  });
}

// The home a conversation started from, for the greeting (AC-13); null once it
// is no longer PUBLISHED.
export type StartingListing = { slug: string; title: string; areaNameEn: string; areaNameBn: string };

const startingSelect = {
  slug: true,
  title: true,
  status: true,
  area: { select: { nameEn: true, nameBn: true } },
} as const;

function startingOf(
  row: { slug: string; title: string; status: string; area: { nameEn: string; nameBn: string } } | null | undefined,
): StartingListing | null {
  if (!row || row.status !== "PUBLISHED") return null;
  return { slug: row.slug, title: row.title, areaNameEn: row.area.nameEn, areaNameBn: row.area.nameBn };
}

// `/assistant?listing=<slug>`: an unknown or unpublished slug is ignored.
export async function startingListingBySlug(slug: string): Promise<StartingListing | null> {
  return startingOf(await db.listing.findUnique({ where: { slug }, select: startingSelect }));
}

export async function conversationStartingListing(actor: Actor, id: string): Promise<StartingListing | null> {
  const row = await db.conversation.findFirst({
    where: { id, userId: actor.id },
    select: { startListing: { select: startingSelect } },
  });
  return startingOf(row?.startListing);
}
