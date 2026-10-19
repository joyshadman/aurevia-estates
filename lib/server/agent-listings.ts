import "server-only";
import { z } from "zod";
import { insideBangladesh, roundCoordinate } from "@/lib/domain/geo";
import { propertyTypes, type PropertyType } from "@/lib/domain/listing-card";
import { InvalidTransitionError } from "@/lib/domain/errors";
import type { ListingActionFailure, ListingActionResult, ListingReason } from "@/lib/domain/listing-messages";
import {
  fieldLabels,
  listingDraftInput,
  listingInput,
  typeRules,
  type EditableField,
  type ListingDraftFields,
} from "@/lib/domain/listing-schema";
import { publishChecklist } from "@/lib/domain/publish-checklist";
import { Prisma, type Listing, type ListingStatus } from "@/lib/generated/prisma/client";
import { ForbiddenError, type Actor } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { LastCoverError, NotFoundError, PublishBlockedError, StaleStatusError } from "@/lib/server/errors";
import { transitionListing } from "@/lib/server/listing-status";
import { nextListingRef, publishListing } from "@/lib/server/listings";
import { toKatha, toTaka } from "@/lib/server/money";
import { checkPhotoUrl, normalizePhotoUrl } from "@/lib/server/photo-links";
import { deletePhoto, photoUrl, setCover } from "@/lib/server/photos";
import { reportEvent } from "@/lib/server/report";

// Agent listing management (spec 0005): the listings table, the edit form's
// reads, and every write. Each write runs in one transaction that first locks
// the listing row, then checks `canEditListing`, so actions on one listing run
// one at a time and never act on a row someone else is changing.

type Tx = Prisma.TransactionClient;

const openLeadStatuses = ["NEW", "CONTACTED", "QUALIFIED"] as const;
const maxPhotos = 20;
const pageSize = 25;

// Results carry `publicChanged` so the action knows to refresh public caches
// (the listing is or was PUBLISHED, or is SOLD). The action strips it.
type Internal<T> = ListingActionResult<T & { publicChanged?: boolean; listingId?: string }>;

const fail = (reason: ListingReason, extra: Omit<ListingActionFailure, "ok" | "reason"> = {}): ListingActionFailure => ({
  ok: false,
  reason,
  ...extra,
});

// Thrown inside a transaction to roll it back and answer with `result`.
class Abort extends Error {
  constructor(readonly result: ListingActionFailure) {
    super(result.reason);
  }
}

// Runs one action's transaction and maps the domain errors to reasons.
async function inTransaction<T>(work: (tx: Tx) => Promise<Internal<T>>): Promise<Internal<T>> {
  try {
    return await db.$transaction(work);
  } catch (error) {
    if (error instanceof Abort) return error.result;
    if (error instanceof ForbiddenError) return fail("forbidden");
    if (error instanceof NotFoundError) return fail("not_found");
    if (error instanceof StaleStatusError || error instanceof InvalidTransitionError) return fail("stale_status");
    if (error instanceof PublishBlockedError) return fail("incomplete", { missing: error.missing });
    if (error instanceof LastCoverError) return fail("last_cover");
    throw error;
  }
}

const isPublic = (status: ListingStatus) => status === "PUBLISHED" || status === "SOLD";

// The editing rule (spec 0005, "State transitions"; same as `ownsListing`).
export function canEditListing(listing: { createdById: string; assignedAgentId: string | null }, actor: Actor) {
  return actor.role === "AGENT" && (listing.createdById === actor.id || listing.assignedAgentId === actor.id);
}

async function lockListing(tx: Tx, id: string) {
  await tx.$executeRaw`SELECT 1 FROM listings WHERE id = ${id}::uuid FOR UPDATE`;
  const listing = await tx.listing.findUnique({ where: { id } });
  if (!listing) throw new NotFoundError("listing", id);
  return listing;
}

// Locks and loads a listing the actor may change. SOLD is read only (AC-10).
async function lockEditable(tx: Tx, id: string, actor: Actor) {
  const listing = await lockListing(tx, id);
  if (!canEditListing(listing, actor)) throw new ForbiddenError();
  if (listing.status === "SOLD") throw new Abort(fail("stale_status"));
  return listing;
}

// The conflict check (AC-13). Every write to a listing goes through here, with an
// app side millisecond Date, so the token round trips exactly.
export async function touchListing(tx: Tx, id: string, expectedUpdatedAt: Date) {
  const updatedAt = new Date();
  const { count } = await tx.listing.updateMany({ where: { id, updatedAt: expectedUpdatedAt }, data: { updatedAt } });
  return { updatedAt, matched: count === 1 };
}

// The token to hand back: read after every write, since status changes also bump it.
async function currentToken(tx: Tx, id: string) {
  const { updatedAt } = await tx.listing.findUniqueOrThrow({ where: { id }, select: { updatedAt: true } });
  return updatedAt.toISOString();
}

// Photo, status, and reassign actions still apply on a stale token, but say so.
async function touchOrFlag(tx: Tx, id: string, expectedUpdatedAt: Date): Promise<{ formStale?: true }> {
  const { matched } = await touchListing(tx, id, expectedUpdatedAt);
  if (!matched) await tx.listing.update({ where: { id }, data: { updatedAt: new Date() } });
  return matched ? {} : { formStale: true };
}

const token = z.iso.datetime().transform((value) => new Date(value));

function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Create (AC-2).

export const newListingInput = z.object({
  title: z.string().trim().min(5, "At least 5 characters").max(120, "Up to 120 characters"),
  propertyType: z.enum(propertyTypes),
  areaId: z.uuid("Choose an area"),
});

export async function createDraft(
  raw: z.input<typeof newListingInput>,
  actor: Actor,
): Promise<{ ok: true; id: string } | ListingActionFailure> {
  if (actor.role !== "AGENT") return fail("forbidden");
  const parsed = newListingInput.safeParse(raw);
  if (!parsed.success) return fail("invalid", { fieldErrors: zodFieldErrors(parsed.error) });
  const { title, propertyType, areaId } = parsed.data;
  const area = await db.area.findUnique({ where: { id: areaId }, select: { isActive: true } });
  if (!area?.isActive) return fail("invalid", { fieldErrors: { areaId: "Choose an area" } });

  const listing = await db.$transaction(async (tx) => {
    const { refCode, slug } = await nextListingRef(title, tx);
    return tx.listing.create({
      data: { title, propertyType, areaId, refCode, slug, createdById: actor.id, assignedAgentId: actor.id },
      select: { id: true },
    });
  });
  return { ok: true, id: listing.id };
}

// ---------------------------------------------------------------------------
// Save and publish (AC-3 to AC-6, AC-9, AC-13, AC-14).

type Merged = {
  title: string;
  propertyType: PropertyType;
  areaId: string;
  addressLine: string | null;
  priceBdt: number | null;
  priceNegotiable: boolean;
  bedrooms: number | null;
  bathrooms: number | null;
  builtUpSqft: number | null;
  landKatha: number | null;
  floorNumber: number | null;
  totalFloors: number | null;
  parkingSpaces: number | null;
  completionStatus: "READY" | "UNDER_CONSTRUCTION" | null;
  handoverDate: string | null;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
};

function storedValues(row: Listing): Merged {
  return {
    title: row.title,
    propertyType: row.propertyType as PropertyType,
    areaId: row.areaId,
    addressLine: row.addressLine,
    priceBdt: row.priceBdt === null ? null : toTaka(row.priceBdt),
    priceNegotiable: row.priceNegotiable,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    builtUpSqft: row.builtUpSqft,
    landKatha: toKatha(row.landKatha),
    floorNumber: row.floorNumber,
    totalFloors: row.totalFloors,
    parkingSpaces: row.parkingSpaces,
    completionStatus: row.completionStatus,
    handoverDate: row.handoverDate?.toISOString().slice(0, 10) ?? null,
    latitude: row.latitude,
    longitude: row.longitude,
    description: row.description,
  };
}

// Steps 2 and 3: stored values overlaid by the sent fields, then the type rules.
function mergeAndNormalize(row: Listing, fields: ListingDraftFields): { merged: Merged; errors: Record<string, string> } {
  const merged = storedValues(row);
  for (const key of Object.keys(merged) as (keyof Merged)[]) {
    const value = fields[key as EditableField];
    if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
  }

  for (const field of typeRules[merged.propertyType].empty) merged[field] = null;
  if (merged.completionStatus !== "UNDER_CONSTRUCTION") merged.handoverDate = null;

  const errors: Record<string, string> = {};
  if ((merged.latitude === null) !== (merged.longitude === null)) {
    errors.longitude = "Set both coordinates or neither";
  } else if (merged.latitude !== null && merged.longitude !== null) {
    merged.latitude = roundCoordinate(merged.latitude);
    merged.longitude = roundCoordinate(merged.longitude);
    if (!insideBangladesh(merged.latitude, merged.longitude)) errors.latitude = "That location is outside Bangladesh.";
  }
  return { merged, errors };
}

// Step 4 for a PUBLISHED listing or a publish: everything Publish needs.
async function publishGaps(tx: Tx, id: string, merged: Merged, amenityIds: string[]) {
  const photos = await tx.listingPhoto.findMany({ where: { listingId: id }, select: { isCover: true } });
  const missing = publishChecklist(merged, photos).missing;
  const full = listingInput.safeParse({ ...merged, amenityIds });
  if (!full.success) {
    for (const issue of full.error.issues) {
      const key = String(issue.path[0]) as keyof typeof fieldLabels;
      const label = fieldLabels[key] ?? key;
      if (!missing.some((m) => m.startsWith(label))) missing.push(label);
    }
  }
  return missing;
}

async function validReferences(tx: Tx, merged: Merged, amenityIds: string[] | undefined) {
  const errors: Record<string, string> = {};
  const area = await tx.area.findUnique({ where: { id: merged.areaId }, select: { id: true } });
  if (!area) errors.areaId = "Choose an area";
  if (amenityIds) {
    const unique = [...new Set(amenityIds)];
    const found = await tx.amenity.count({ where: { id: { in: unique }, isActive: true } });
    if (found !== unique.length) errors.amenityIds = "Choose from the listed amenities";
  }
  return errors;
}

export const saveInput = z.object({
  id: z.uuid(),
  expectedUpdatedAt: token,
  fields: listingDraftInput,
});

export type SaveInput = z.input<typeof saveInput>;

async function saveInTransaction(tx: Tx, input: z.output<typeof saveInput>, actor: Actor, publishing: boolean) {
  const { id, expectedUpdatedAt, fields } = input;
  const row = await lockEditable(tx, id, actor);
  if (publishing && row.status !== "DRAFT" && row.status !== "UNPUBLISHED") throw new Abort(fail("stale_status"));

  const { merged, errors } = mergeAndNormalize(row, fields);
  Object.assign(errors, await validReferences(tx, merged, fields.amenityIds));
  if (Object.keys(errors).length > 0) throw new Abort(fail("invalid", { fieldErrors: errors }));

  // A PUBLISHED listing stays complete after every save (AC-4).
  if (publishing || row.status === "PUBLISHED") {
    const amenityIds =
      fields.amenityIds ??
      (await tx.listingAmenity.findMany({ where: { listingId: id }, select: { amenityId: true } })).map((a) => a.amenityId);
    const missing = await publishGaps(tx, id, merged, amenityIds);
    if (missing.length > 0) throw new Abort(fail("incomplete", { missing }));
  }

  const { updatedAt, matched } = await touchListing(tx, id, expectedUpdatedAt);
  if (!matched) throw new Abort(fail("stale"));

  const { priceBdt, landKatha, handoverDate, ...rest } = merged;
  await tx.listing.update({
    where: { id },
    data: {
      ...rest,
      priceBdt: priceBdt === null ? null : BigInt(priceBdt),
      landKatha,
      handoverDate: handoverDate ? new Date(`${handoverDate}T00:00:00Z`) : null,
      updatedAt,
    },
  });
  // A list replaces the set; no list leaves it alone (AC-9).
  if (fields.amenityIds) {
    await tx.listingAmenity.deleteMany({ where: { listingId: id } });
    await tx.listingAmenity.createMany({
      data: [...new Set(fields.amenityIds)].map((amenityId) => ({ listingId: id, amenityId })),
    });
  }
  return row;
}

export async function saveListing(raw: SaveInput, actor: Actor): Promise<Internal<object>> {
  const parsed = saveInput.safeParse(raw);
  if (!parsed.success) return fail("invalid", { fieldErrors: zodFieldErrors(parsed.error) });
  return inTransaction<object>(async (tx) => {
    const before = await saveInTransaction(tx, parsed.data, actor, false);
    return { ok: true, updatedAt: await currentToken(tx, before.id), publicChanged: isPublic(before.status) };
  });
}

// Saves the form's values and publishes, all or nothing, under one row lock, so
// a photo removed at the same moment can't leave a listing without a cover (AC-5).
export async function publishWithSave(raw: SaveInput, actor: Actor): Promise<Internal<object>> {
  const parsed = saveInput.safeParse(raw);
  if (!parsed.success) return fail("invalid", { fieldErrors: zodFieldErrors(parsed.error) });
  return inTransaction<object>(async (tx) => {
    const before = await saveInTransaction(tx, parsed.data, actor, true);
    await publishListing(before.id, actor, tx);
    return { ok: true, updatedAt: await currentToken(tx, before.id), publicChanged: true };
  });
}

// ---------------------------------------------------------------------------
// Photos (AC-8, AC-13). The link check runs before the transaction, so no row
// lock is held during the outbound request.

const photoInput = z.object({ photoId: z.uuid(), expectedUpdatedAt: token });
const altText = z.string().trim().min(1, "Describe the photo").max(160, "Up to 160 characters");

export type PhotoDTO = { id: string; url: string; alt: string; isCover: boolean; sortOrder: number };

async function lockPhotoListing(tx: Tx, photoId: string, actor: Actor) {
  const photo = await tx.listingPhoto.findUnique({ where: { id: photoId } });
  if (!photo) throw new NotFoundError("photo", photoId);
  const listing = await lockEditable(tx, photo.listingId, actor);
  return { photo, listing };
}

export async function addPhoto(
  raw: { listingId: string; expectedUpdatedAt: string; url: string; alt?: string },
  actor: Actor,
  options: { fetch?: typeof fetch } = {},
): Promise<Internal<{ photo: PhotoDTO }>> {
  const parsed = z
    .object({ listingId: z.uuid(), expectedUpdatedAt: token, url: z.string().max(2000), alt: altText.optional() })
    .safeParse(raw);
  if (!parsed.success) return fail("invalid", { fieldErrors: zodFieldErrors(parsed.error) });
  const { listingId, expectedUpdatedAt, alt } = parsed.data;
  if (actor.role !== "AGENT") return fail("forbidden");

  const normalized = normalizePhotoUrl(parsed.data.url);
  if (!normalized.ok) return fail(normalized.reason);
  const checked = await checkPhotoUrl(normalized.url, { isDrive: normalized.isDrive, fetch: options.fetch });
  if (!checked.ok) return fail(checked.reason);

  return inTransaction<{ photo: PhotoDTO }>(async (tx) => {
    const listing = await lockEditable(tx, listingId, actor);
    const photos = await tx.listingPhoto.findMany({ where: { listingId }, select: { url: true, sortOrder: true } });
    if (photos.length >= maxPhotos) throw new Abort(fail("photo_limit"));
    if (photos.some((p) => p.url === checked.url)) throw new Abort(fail("duplicate"));

    const created = await tx.listingPhoto.create({
      data: {
        listingId,
        url: checked.url,
        alt: alt ?? listing.title,
        sortOrder: Math.max(-1, ...photos.map((p) => p.sortOrder)) + 1,
        isCover: photos.length === 0,
      },
    });
    const stale = await touchOrFlag(tx, listingId, expectedUpdatedAt);
    return {
      ok: true,
      ...stale,
      updatedAt: await currentToken(tx, listingId),
      publicChanged: isPublic(listing.status),
      listingId,
      photo: { id: created.id, url: photoUrl(created), alt: created.alt, isCover: created.isCover, sortOrder: created.sortOrder },
    };
  });
}

export async function movePhoto(
  raw: { photoId: string; expectedUpdatedAt: string; direction: "up" | "down" },
  actor: Actor,
): Promise<Internal<object>> {
  const parsed = photoInput.extend({ direction: z.enum(["up", "down"]) }).safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const { photoId, expectedUpdatedAt, direction } = parsed.data;
  return inTransaction<object>(async (tx) => {
    const { photo, listing } = await lockPhotoListing(tx, photoId, actor);
    const neighbor = await tx.listingPhoto.findFirst({
      where: {
        listingId: listing.id,
        sortOrder: direction === "up" ? { lt: photo.sortOrder } : { gt: photo.sortOrder },
      },
      orderBy: { sortOrder: direction === "up" ? "desc" : "asc" },
    });
    if (neighbor) {
      await tx.listingPhoto.update({ where: { id: photo.id }, data: { sortOrder: neighbor.sortOrder } });
      await tx.listingPhoto.update({ where: { id: neighbor.id }, data: { sortOrder: photo.sortOrder } });
    }
    const stale = await touchOrFlag(tx, listing.id, expectedUpdatedAt);
    return { ok: true, ...stale, updatedAt: await currentToken(tx, listing.id), publicChanged: isPublic(listing.status), listingId: listing.id };
  });
}

export async function setCoverPhoto(
  raw: { photoId: string; expectedUpdatedAt: string },
  actor: Actor,
): Promise<Internal<object>> {
  const parsed = photoInput.safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const { photoId, expectedUpdatedAt } = parsed.data;
  return inTransaction<object>(async (tx) => {
    const { listing } = await lockPhotoListing(tx, photoId, actor);
    await setCover(photoId, actor, tx);
    const stale = await touchOrFlag(tx, listing.id, expectedUpdatedAt);
    return { ok: true, ...stale, updatedAt: await currentToken(tx, listing.id), publicChanged: isPublic(listing.status), listingId: listing.id };
  });
}

export async function updatePhotoAlt(
  raw: { photoId: string; expectedUpdatedAt: string; alt: string },
  actor: Actor,
): Promise<Internal<object>> {
  const parsed = photoInput.extend({ alt: altText }).safeParse(raw);
  if (!parsed.success) return fail("invalid", { fieldErrors: zodFieldErrors(parsed.error) });
  const { photoId, expectedUpdatedAt, alt } = parsed.data;
  return inTransaction<object>(async (tx) => {
    const { listing } = await lockPhotoListing(tx, photoId, actor);
    await tx.listingPhoto.update({ where: { id: photoId }, data: { alt } });
    const stale = await touchOrFlag(tx, listing.id, expectedUpdatedAt);
    return { ok: true, ...stale, updatedAt: await currentToken(tx, listing.id), publicChanged: isPublic(listing.status), listingId: listing.id };
  });
}

export async function removePhoto(
  raw: { photoId: string; expectedUpdatedAt: string },
  actor: Actor,
): Promise<Internal<object>> {
  const parsed = photoInput.safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const { photoId, expectedUpdatedAt } = parsed.data;
  return inTransaction<object>(async (tx) => {
    const { listing } = await lockPhotoListing(tx, photoId, actor);
    await deletePhoto(photoId, actor, tx);
    const stale = await touchOrFlag(tx, listing.id, expectedUpdatedAt);
    return { ok: true, ...stale, updatedAt: await currentToken(tx, listing.id), publicChanged: isPublic(listing.status), listingId: listing.id };
  });
}

// ---------------------------------------------------------------------------
// Lifecycle (AC-10) and reassign (AC-11).

const statusInput = z.object({ id: z.uuid(), expectedUpdatedAt: token });

async function changeStatus(
  raw: { id: string; expectedUpdatedAt: string },
  to: ListingStatus,
  actor: Actor,
): Promise<Internal<object>> {
  const parsed = statusInput.safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const { id, expectedUpdatedAt } = parsed.data;
  return inTransaction<object>(async (tx) => {
    await lockEditable(tx, id, actor);
    const stale = await touchOrFlag(tx, id, expectedUpdatedAt);
    await transitionListing(id, to, actor, tx);
    return { ok: true, ...stale, updatedAt: await currentToken(tx, id), publicChanged: true };
  });
}

export const unpublishListing = (raw: { id: string; expectedUpdatedAt: string }, actor: Actor) =>
  changeStatus(raw, "UNPUBLISHED", actor);

export const markListingSold = (raw: { id: string; expectedUpdatedAt: string }, actor: Actor) =>
  changeStatus(raw, "SOLD", actor);

// Publish again from UNPUBLISHED without form changes goes through
// `publishWithSave` with empty fields, so it gets the same checks.

export async function deleteDraft(raw: { id: string }, actor: Actor): Promise<{ ok: true } | ListingActionFailure> {
  const parsed = z.object({ id: z.uuid() }).safeParse(raw);
  if (!parsed.success) return fail("invalid");
  const { id } = parsed.data;
  try {
    return await db.$transaction(async (tx) => {
      const listing = await lockListing(tx, id);
      if (!canEditListing(listing, actor)) return fail("forbidden");
      if (listing.status !== "DRAFT") return fail("not_deletable");
      await tx.listingPhoto.deleteMany({ where: { listingId: id } });
      await tx.listingAmenity.deleteMany({ where: { listingId: id } });
      await tx.listing.delete({ where: { id } });
      return { ok: true as const };
    });
  } catch (error) {
    // Something still points at it (a recommendation, a lead); the transaction rolled back.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") return fail("not_deletable");
    if (error instanceof NotFoundError) return fail("not_found");
    throw error;
  }
}

const agentName = (p: { fullName: string | null; email: string | null } | null) =>
  p ? p.fullName?.trim() || p.email?.split("@")[0] || "an agent" : "Unassigned";

export async function reassignListing(
  raw: { id: string; expectedUpdatedAt: string; agentId: string },
  actor: Actor,
): Promise<Internal<{ movedLeads: number }>> {
  const parsed = statusInput.extend({ agentId: z.uuid() }).safeParse(raw);
  if (!parsed.success) return fail("invalid_agent");
  const { id, expectedUpdatedAt, agentId } = parsed.data;

  return inTransaction<{ movedLeads: number }>(async (tx) => {
    const listing = await lockEditable(tx, id, actor);
    const target = await tx.profile.findFirst({
      where: { id: agentId, role: "AGENT", deletedAt: null },
      select: { id: true, fullName: true, email: true },
    });
    if (!target) throw new Abort(fail("invalid_agent"));

    // Choosing the current agent changes nothing.
    if (listing.assignedAgentId === agentId) {
      const stale = listing.updatedAt.getTime() === expectedUpdatedAt.getTime() ? {} : { formStale: true as const };
      return { ok: true, ...stale, updatedAt: listing.updatedAt.toISOString(), movedLeads: 0, publicChanged: false };
    }

    const previous = listing.assignedAgentId
      ? await tx.profile.findUnique({ where: { id: listing.assignedAgentId }, select: { fullName: true, email: true } })
      : null;
    const stale = await touchOrFlag(tx, id, expectedUpdatedAt);
    await tx.listing.update({ where: { id }, data: { assignedAgentId: agentId } });

    const leads = await tx.lead.findMany({
      where: { listingId: id, status: { in: [...openLeadStatuses] } },
      select: { id: true },
    });
    if (leads.length > 0) {
      await tx.lead.updateMany({ where: { id: { in: leads.map((l) => l.id) } }, data: { assignedAgentId: agentId } });
      const body = `Reassigned from ${agentName(previous)} to ${agentName(target)} with the listing`;
      await tx.leadActivity.createMany({
        data: leads.map((lead) => ({ leadId: lead.id, actorId: actor.id, type: "SYSTEM" as const, body })),
      });
    }

    reportEvent("listing.reassigned", {
      listing_id: id,
      from_agent_id: listing.assignedAgentId,
      to_agent_id: agentId,
      by_agent_id: actor.id,
      moved_leads: leads.length,
    });
    return {
      ok: true,
      ...stale,
      updatedAt: await currentToken(tx, id),
      movedLeads: leads.length,
      publicChanged: isPublic(listing.status),
    };
  });
}

// ---------------------------------------------------------------------------
// Reads (AC-1, the edit page).

export const listingTabs = ["all", "published", "unpublished", "drafts", "sold"] as const;
export type ListingTab = (typeof listingTabs)[number];

const tabStatus: Record<ListingTab, ListingStatus | null> = {
  all: null,
  published: "PUBLISHED",
  unpublished: "UNPUBLISHED",
  drafts: "DRAFT",
  sold: "SOLD",
};

const listCursor = z.object({ updatedAt: z.iso.datetime(), id: z.uuid() });

function decodeListCursor(cursor: string | undefined) {
  if (!cursor) return null;
  try {
    return listCursor.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
  } catch {
    return null;
  }
}

export async function listAgencyListings(
  query: { tab?: ListingTab; q?: string; mine?: boolean; cursor?: string },
  actor: Actor,
) {
  if (actor.role !== "AGENT") throw new ForbiddenError();
  const and: Prisma.ListingWhereInput[] = [];
  const status = tabStatus[query.tab ?? "all"];
  if (status) and.push({ status });
  if (query.mine ?? true) and.push({ OR: [{ createdById: actor.id }, { assignedAgentId: actor.id }] });

  const q = query.q?.trim().slice(0, 120);
  if (q) {
    // Title contains, or the exact code in any case (`aur-1042` finds AUR-1042).
    and.push({ OR: [{ title: { contains: q, mode: "insensitive" } }, { refCode: q.toUpperCase() }] });
  }

  const cursor = decodeListCursor(query.cursor);
  if (cursor) {
    const updatedAt = new Date(cursor.updatedAt);
    and.push({ OR: [{ updatedAt: { lt: updatedAt } }, { updatedAt, id: { lt: cursor.id } }] });
  }

  const rows = await db.listing.findMany({
    where: { AND: and },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
    select: {
      id: true,
      title: true,
      refCode: true,
      propertyType: true,
      priceBdt: true,
      status: true,
      updatedAt: true,
      area: { select: { nameEn: true } },
      assignedAgent: { select: { fullName: true, email: true } },
      _count: { select: { leads: { where: { status: { in: [...openLeadStatuses] } } } } },
    },
  });

  const page = rows.slice(0, pageSize);
  const last = page.at(-1);
  const nextCursor =
    rows.length > pageSize && last
      ? Buffer.from(JSON.stringify({ updatedAt: last.updatedAt.toISOString(), id: last.id })).toString("base64url")
      : null;

  return {
    rows: page.map((row) => ({
      id: row.id,
      title: row.title,
      refCode: row.refCode,
      propertyType: row.propertyType as PropertyType,
      areaName: row.area.nameEn,
      priceBdt: row.priceBdt === null ? null : toTaka(row.priceBdt),
      status: row.status,
      openLeads: row._count.leads,
      advisor: agentName(row.assignedAgent),
      updatedAt: row.updatedAt.toISOString(),
    })),
    nextCursor,
  };
}

export type AgencyListingRow = Awaited<ReturnType<typeof listAgencyListings>>["rows"][number];

export async function getListingForEdit(id: string, actor: Actor) {
  if (actor.role !== "AGENT") throw new ForbiddenError();
  if (!z.uuid().safeParse(id).success) return null;
  const row = await db.listing.findUnique({
    where: { id },
    include: {
      photos: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      amenities: { select: { amenityId: true } },
      createdBy: { select: { fullName: true, email: true } },
      assignedAgent: { select: { fullName: true, email: true } },
    },
  });
  if (!row) return null;
  const values = storedValues(row);
  const photos: PhotoDTO[] = row.photos.map((p) => ({
    id: p.id,
    url: photoUrl(p),
    alt: p.alt,
    isCover: p.isCover,
    sortOrder: p.sortOrder,
  }));
  return {
    id: row.id,
    refCode: row.refCode,
    slug: row.slug,
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
    values,
    amenityIds: row.amenities.map((a) => a.amenityId),
    photos,
    creatorName: agentName(row.createdBy),
    assignedAgentId: row.assignedAgentId,
    advisorName: agentName(row.assignedAgent),
    canEdit: canEditListing(row, actor) && row.status !== "SOLD",
    isOwner: canEditListing(row, actor),
    checklist: publishChecklist(values, photos),
  };
}

export type ListingForEdit = NonNullable<Awaited<ReturnType<typeof getListingForEdit>>>;

export async function listActiveAgents() {
  const rows = await db.profile.findMany({
    where: { role: "AGENT", deletedAt: null },
    select: { id: true, fullName: true, email: true },
    orderBy: [{ fullName: "asc" }, { id: "asc" }],
  });
  return rows.map((r) => ({ id: r.id, fullName: agentName(r) }));
}

// The form's choices: active areas and amenities, in their display order.
export async function listingFormOptions() {
  const [areas, amenities] = await Promise.all([
    db.area.findMany({ where: { isActive: true }, select: { id: true, nameEn: true }, orderBy: { sortOrder: "asc" } }),
    db.amenity.findMany({ where: { isActive: true }, select: { id: true, label: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  return { areas, amenities };
}
