import "server-only";
import { z } from "zod";
import type { ListingCardDTO } from "@/lib/domain/listing-card";
import type { Actor } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { listingCardInclude, serializeListing, toCardDTO } from "@/lib/server/listings";
import { toTaka } from "@/lib/server/money";

// Saved homes (spec 0013, assumed). Every function takes the signed in actor;
// a visitor only ever reads or writes their own rows.

export const savedLimit = 200;
export const savedPageSize = 24;
export const chatSavedLimit = 20;

// Hearts on every page fill from this one list (spec 0013).
export async function savedListingIds(actor: Actor): Promise<string[]> {
  const rows = await db.savedHome.findMany({
    where: { userId: actor.id },
    select: { listingId: true },
    orderBy: { createdAt: "desc" },
    take: savedLimit,
  });
  return rows.map((r) => r.listingId);
}

export type SetSavedResult = { ok: true } | { ok: false; reason: "not_found" | "limit" };

// Only PUBLISHED homes can be saved; unsaving always works, whatever the status.
// The profile row lock keeps two quick saves from passing the cap together.
export async function setSaved(actor: Actor, listingId: string, saved: boolean): Promise<SetSavedResult> {
  if (!saved) {
    await db.savedHome.deleteMany({ where: { userId: actor.id, listingId } });
    return { ok: true };
  }
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM profiles WHERE id = ${actor.id}::uuid FOR UPDATE`;
    const existing = await tx.savedHome.findUnique({ where: { userId_listingId: { userId: actor.id, listingId } }, select: { listingId: true } });
    if (existing) return { ok: true } as const;
    const listing = await tx.listing.findUnique({ where: { id: listingId }, select: { status: true } });
    if (listing?.status !== "PUBLISHED") return { ok: false, reason: "not_found" } as const;
    if ((await tx.savedHome.count({ where: { userId: actor.id } })) >= savedLimit) return { ok: false, reason: "limit" } as const;
    await tx.savedHome.create({ data: { userId: actor.id, listingId } });
    return { ok: true } as const;
  });
}

// ---------------------------------------------------------------------------
// The `/saved` page: newest first, 24 per page, keyset on (created_at, listing_id).

export type SavedItem =
  | { listingId: string; available: true; card: ListingCardDTO & { pricePerSqft: number | null } }
  | { listingId: string; available: false; title: string };

export type SavedPage = { items: SavedItem[]; nextCursor: string | null };

const cursorShape = z.object({ c: z.iso.datetime(), id: z.uuid() });

function encodeCursor(row: { createdAt: Date; listingId: string }) {
  return Buffer.from(JSON.stringify({ c: row.createdAt.toISOString(), id: row.listingId })).toString("base64url");
}

function decodeCursor(cursor: string | undefined) {
  if (!cursor) return null;
  try {
    return cursorShape.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
  } catch {
    return null;
  }
}

export async function listSaved(actor: Actor, cursor?: string): Promise<SavedPage> {
  const after = decodeCursor(cursor);
  const rows = await db.savedHome.findMany({
    where: {
      userId: actor.id,
      ...(after && {
        OR: [{ createdAt: { lt: new Date(after.c) } }, { createdAt: new Date(after.c), listingId: { lt: after.id } }],
      }),
    },
    include: { listing: { include: listingCardInclude } },
    orderBy: [{ createdAt: "desc" }, { listingId: "desc" }],
    take: savedPageSize + 1,
  });
  const page = rows.slice(0, savedPageSize);
  const items = page.map((row): SavedItem => {
    if (row.listing.status !== "PUBLISHED") return { listingId: row.listingId, available: false, title: row.listing.title };
    const card = toCardDTO(serializeListing(row.listing));
    return { listingId: row.listingId, available: true, card: { ...card, pricePerSqft: card.builtUpSqft ? Math.round(card.priceBdt / card.builtUpSqft) : null } };
  });
  return { items, nextCursor: rows.length > savedPageSize ? encodeCursor(page[page.length - 1]) : null };
}

// ---------------------------------------------------------------------------
// The chat's Saved tab: available homes only, newest saved first, up to 20.

export type ChatSavedHome = { listingId: string; slug: string; title: string; areaName: string; priceBdt: number };

export async function savedForChat(actor: Actor): Promise<ChatSavedHome[]> {
  const rows = await db.savedHome.findMany({
    where: { userId: actor.id, listing: { status: "PUBLISHED" } },
    select: { listing: { select: { id: true, slug: true, title: true, priceBdt: true, area: { select: { nameEn: true } } } } },
    orderBy: [{ createdAt: "desc" }, { listingId: "desc" }],
    take: chatSavedLimit,
  });
  return rows.map(({ listing }) => ({
    listingId: listing.id,
    slug: listing.slug,
    title: listing.title,
    areaName: listing.area.nameEn,
    priceBdt: toTaka(listing.priceBdt!),
  }));
}
