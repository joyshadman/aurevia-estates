import "server-only";
import { z } from "zod";
import { displayName } from "@/lib/domain/display-name";
import { InvalidTransitionError } from "@/lib/domain/errors";
import { openLeadStatuses } from "@/lib/domain/lead-status";
import { propertyTypes, type PropertyType } from "@/lib/domain/listing-card";
import { listingDraftInput, listingInput, typeRules } from "@/lib/domain/listing-schema";
import { roundCoordinate } from "@/lib/domain/location";
import { publishChecklist } from "@/lib/domain/publish-checklist";
import { Prisma, type ListingStatus } from "@/lib/generated/prisma/client";
import type { AgentUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { ForbiddenError, LastCoverError, PublishBlockedError, StaleStatusError } from "@/lib/server/errors";
import { transitionListing, ownsListing } from "@/lib/server/listing-status";
import { nextListingRef, publishListing } from "@/lib/server/listings";
import { fromTaka, toKatha, toTaka } from "@/lib/server/money";
import { checkPhotoUrl, normalizePhotoUrl, type PhotoLinkReason } from "@/lib/server/photo-links";
import { deletePhoto, photoUrl, setCover } from "@/lib/server/photos";
import { reportEvent } from "@/lib/server/report";

// Agent listing management (spec 0005). Every write locks the listing row,
// checks `canEditListing`, and moves `updated_at` through `touchListing`, the
// conflict token the edit form holds (AC-13).

export type ListingReason =
  | "forbidden"
  | "not_found"
  | "stale"
  | "stale_status"
  | "invalid"
  | "incomplete"
  | "last_cover"
  | "not_deletable"
  | "invalid_agent"
  | "duplicate"
  | "photo_limit"
  | PhotoLinkReason;

export type ListingFailure = {
  ok: false;
  reason: ListingReason;
  missing?: string[];
  fieldErrors?: Record<string, string>;
};

export type ListingSuccess<T extends object = object> = {
  ok: true;
  updatedAt: string;
  formStale?: true;
  // The public pages need a refresh: the listing is or was published (spec 0005, *Cache*).
  refreshPublic: boolean;
} & T;

type Result<T extends object = object> = ListingSuccess<T> | ListingFailure;

// AC-12: the creator or the assigned agent. A former assignee who is not the
// creator loses the right on reassignment.
export function canEditListing(listing: { createdById: string; assignedAgentId: string | null }, agentId: string) {
  return ownsListing(listing, { id: agentId, role: "AGENT" });
}

// Rolls the transaction back and becomes a failure result.
class ListingAbort extends Error {
  constructor(readonly failure: ListingFailure) {
    super(failure.reason);
  }
}

const abort = (reason: ListingReason, extra: Omit<ListingFailure, "ok" | "reason"> = {}): never => {
  throw new ListingAbort({ ok: false, reason, ...extra });
};

async function lockListing(tx: Prisma.TransactionClient, id: string) {
  await tx.$executeRaw`SELECT 1 FROM listings WHERE id = ${id}::uuid FOR UPDATE`;
  const listing = await tx.listing.findUnique({ where: { id } });
  if (!listing) abort("not_found");
  return listing!;
}

// Every write to a listing row sets `updated_at` here, to an app side
// millisecond Date. `matched` is false when the form's token is out of date.
export async function touchListing(tx: Prisma.TransactionClient, id: string, expectedUpdatedAt: Date) {
  const updatedAt = new Date();
  const { count } = await tx.listing.updateMany({ where: { id, updatedAt: expectedUpdatedAt }, data: { updatedAt } });
  return { updatedAt, matched: count === 1 };
}

// Photo, status, and reassign actions still apply on a stale token, but tell
// the form not to adopt the new one (AC-13).
async function touchOrForce(tx: Prisma.TransactionClient, id: string, expectedUpdatedAt: Date) {
  const touched = await touchListing(tx, id, expectedUpdatedAt);
  if (touched.matched) return { formStale: false as const };
  await tx.listing.update({ where: { id }, data: { updatedAt: new Date() } });
  return { formStale: true as const };
}

// The token the form keeps: whatever the row holds once every write is done.
async function finalToken(tx: Prisma.TransactionClient, id: string) {
  const { updatedAt } = await tx.listing.findUniqueOrThrow({ where: { id }, select: { updatedAt: true } });
  return updatedAt.toISOString();
}

const wasPublic = (listing: { publishedAt: Date | null }) => listing.publishedAt !== null;

// Runs an action's transaction and turns the known failures into results.
async function run<T extends object>(work: (tx: Prisma.TransactionClient) => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await db.$transaction(work);
  } catch (error) {
    if (error instanceof ListingAbort) return error.failure;
    if (error instanceof ForbiddenError) return { ok: false, reason: "forbidden" };
    if (error instanceof StaleStatusError || error instanceof InvalidTransitionError) return { ok: false, reason: "stale_status" };
    if (error instanceof PublishBlockedError) return { ok: false, reason: "incomplete", missing: error.missing };
    if (error instanceof LastCoverError) return { ok: false, reason: "last_cover" };
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Field saves and publish (AC-3 to AC-6, AC-9, AC-14).

const nullableNumber = z.number().finite().nullable().optional();

// A key that is absent leaves the field alone; `null` clears it (AC-4). Each
// value's own rule runs after the merge, against the effective type.
export const listingPatch = z
  .object({
    title: z.string().max(400).optional(),
    propertyType: z.enum(propertyTypes).optional(),
    areaId: z.uuid().optional(),
    addressLine: z.string().max(1000).nullable().optional(),
    priceBdt: nullableNumber,
    priceNegotiable: z.boolean().optional(),
    bedrooms: nullableNumber,
    bathrooms: nullableNumber,
    builtUpSqft: nullableNumber,
    landKatha: nullableNumber,
    floorNumber: nullableNumber,
    totalFloors: nullableNumber,
    parkingSpaces: nullableNumber,
    completionStatus: z.enum(["READY", "UNDER_CONSTRUCTION"]).nullable().optional(),
    handoverDate: z.string().max(20).nullable().optional(),
    latitude: nullableNumber,
    longitude: nullableNumber,
    description: z.string().max(20_000).nullable().optional(),
    amenityIds: z.array(z.uuid()).max(50).optional(),
  })
  .strict();

export type ListingPatch = z.infer<typeof listingPatch>;

type ListingRow = Prisma.ListingGetPayload<object>;

function storedValues(row: ListingRow) {
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

type Merged = ReturnType<typeof storedValues>;

// Step 2 and 3 of *Save*: overlay the patch, then clear what the type forbids,
// the handover date unless under construction, and round the coordinates.
function mergeAndNormalize(row: ListingRow, patch: ListingPatch): Merged {
  const fields: Omit<ListingPatch, "amenityIds"> = { ...patch };
  delete (fields as ListingPatch).amenityIds;
  const merged: Merged = { ...storedValues(row), ...fields } as Merged;
  const blank = (value: string | null) => (value === null || value.trim() === "" ? null : value.trim());
  merged.addressLine = blank(merged.addressLine);
  merged.description = blank(merged.description);
  merged.title = merged.title.trim();
  for (const field of typeRules[merged.propertyType].empty) merged[field] = null;
  if (merged.completionStatus !== "UNDER_CONSTRUCTION") merged.handoverDate = null;
  if (merged.latitude !== null) merged.latitude = roundCoordinate(merged.latitude);
  if (merged.longitude !== null) merged.longitude = roundCoordinate(merged.longitude);
  return merged;
}

function fieldErrors(error: z.ZodError) {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return errors;
}

// Saves the patch inside `tx`. `publishing` applies the full publish rules.
async function saveInTx(
  tx: Prisma.TransactionClient,
  agent: AgentUser,
  id: string,
  expectedUpdatedAt: Date,
  patch: ListingPatch,
  publishing: boolean,
) {
  const row = await lockListing(tx, id);
  if (!canEditListing(row, agent.id)) abort("forbidden");
  if (row.status === "SOLD") abort("stale_status");

  const merged = mergeAndNormalize(row, patch);
  const draft = listingDraftInput.safeParse({ ...merged, amenityIds: patch.amenityIds });
  if (!draft.success) abort("invalid", { fieldErrors: fieldErrors(draft.error) });

  if (patch.amenityIds) {
    const active = await tx.amenity.count({ where: { id: { in: patch.amenityIds }, isActive: true } });
    if (active !== new Set(patch.amenityIds).size) abort("invalid", { fieldErrors: { amenityIds: "Choose from the list" } });
  }

  // A PUBLISHED listing stays complete after every save (AC-4); publishing needs
  // the same, checked against the merged result and the photos under the lock.
  if (publishing || row.status === "PUBLISHED") {
    const photos = await tx.listingPhoto.findMany({ where: { listingId: id }, select: { isCover: true } });
    const checklist = publishChecklist(merged, photos);
    const full = listingInput.safeParse({ ...merged, amenityIds: patch.amenityIds });
    if (!checklist.complete) abort("incomplete", { missing: checklist.missing });
    if (!full.success) abort("invalid", { fieldErrors: fieldErrors(full.error) });
  }

  const touched = await touchListing(tx, id, expectedUpdatedAt);
  if (!touched.matched) abort("stale");

  await tx.listing.update({
    where: { id },
    data: {
      title: merged.title,
      propertyType: merged.propertyType,
      areaId: merged.areaId,
      addressLine: merged.addressLine,
      priceBdt: merged.priceBdt === null ? null : fromTaka(merged.priceBdt),
      priceNegotiable: merged.priceNegotiable,
      bedrooms: merged.bedrooms,
      bathrooms: merged.bathrooms,
      builtUpSqft: merged.builtUpSqft,
      landKatha: merged.landKatha === null ? null : new Prisma.Decimal(merged.landKatha),
      floorNumber: merged.floorNumber,
      totalFloors: merged.totalFloors,
      parkingSpaces: merged.parkingSpaces,
      completionStatus: merged.completionStatus,
      handoverDate: merged.handoverDate === null ? null : new Date(`${merged.handoverDate}T00:00:00Z`),
      latitude: merged.latitude,
      longitude: merged.longitude,
      description: merged.description,
      updatedAt: touched.updatedAt,
    },
  });
  if (patch.amenityIds) {
    await tx.listingAmenity.deleteMany({ where: { listingId: id } });
    await tx.listingAmenity.createMany({ data: patch.amenityIds.map((amenityId) => ({ listingId: id, amenityId })) });
  }
  return row;
}

export async function saveListing(agent: AgentUser, id: string, expectedUpdatedAt: Date, patch: ListingPatch) {
  return run(async (tx) => {
    const row = await saveInTx(tx, agent, id, expectedUpdatedAt, patch, false);
    return { ok: true, updatedAt: await finalToken(tx, id), refreshPublic: wasPublic(row) };
  });
}

// Save the form's current values and publish, in one transaction (AC-5).
export async function publishWithFields(agent: AgentUser, id: string, expectedUpdatedAt: Date, patch: ListingPatch) {
  return run(async (tx) => {
    await saveInTx(tx, agent, id, expectedUpdatedAt, patch, true);
    await publishListing(id, agent, tx);
    return { ok: true, updatedAt: await finalToken(tx, id), refreshPublic: true };
  });
}

// ---------------------------------------------------------------------------
// Create and delete (AC-2, AC-10).

export const draftCreateInput = z.object({
  title: z.string().trim().min(5).max(120),
  propertyType: z.enum(propertyTypes),
  areaId: z.uuid(),
});

export async function createDraft(agent: AgentUser, input: z.infer<typeof draftCreateInput>) {
  return db.$transaction(async (tx) => {
    const area = await tx.area.findFirst({ where: { id: input.areaId, isActive: true }, select: { id: true } });
    if (!area) return { ok: false as const, reason: "invalid" as const, fieldErrors: { areaId: "Choose an area" } };
    const ref = await nextListingRef(input.title, tx);
    const listing = await tx.listing.create({
      data: {
        ...ref,
        title: input.title,
        propertyType: input.propertyType,
        areaId: input.areaId,
        createdById: agent.id,
        assignedAgentId: agent.id,
        updatedAt: new Date(),
      },
      select: { id: true },
    });
    return { ok: true as const, id: listing.id };
  });
}

export async function deleteDraft(agent: AgentUser, id: string): Promise<{ ok: true } | ListingFailure> {
  try {
    return await db.$transaction(async (tx) => {
      const row = await lockListing(tx, id);
      if (!canEditListing(row, agent.id)) abort("forbidden");
      if (row.status !== "DRAFT") abort("not_deletable");
      await tx.listingPhoto.deleteMany({ where: { listingId: id } });
      await tx.listingAmenity.deleteMany({ where: { listingId: id } });
      await tx.listing.delete({ where: { id } });
      return { ok: true as const };
    });
  } catch (error) {
    if (error instanceof ListingAbort) return error.failure;
    // A row elsewhere still points at it (for example a recommendation).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return { ok: false, reason: "not_deletable" };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Lifecycle (AC-10). Status changes go only through `transitionListing`.

export async function changeStatus(agent: AgentUser, id: string, expectedUpdatedAt: Date, to: "UNPUBLISHED" | "SOLD") {
  return run(async (tx) => {
    const row = await lockListing(tx, id);
    if (!canEditListing(row, agent.id)) abort("forbidden");
    const { formStale } = await touchOrForce(tx, id, expectedUpdatedAt);
    await transitionListing(id, to, agent, tx);
    return {
      ok: true,
      updatedAt: await finalToken(tx, id),
      refreshPublic: wasPublic(row),
      ...(formStale ? { formStale } : {}),
    };
  });
}

// ---------------------------------------------------------------------------
// Reassign (AC-11): the listing and its open leads move together.


export async function reassignListing(agent: AgentUser, id: string, expectedUpdatedAt: Date, agentId: string) {
  return run<{ movedLeads: number }>(async (tx) => {
    const row = await lockListing(tx, id);
    if (!canEditListing(row, agent.id)) abort("forbidden");
    const target = await tx.profile.findFirst({
      where: { id: agentId, role: "AGENT", deletedAt: null },
      select: { id: true, fullName: true, email: true },
    });
    if (!target) abort("invalid_agent");
    if (row.assignedAgentId === agentId) {
      return { ok: true, updatedAt: row.updatedAt.toISOString(), refreshPublic: false, movedLeads: 0 };
    }

    const { formStale } = await touchOrForce(tx, id, expectedUpdatedAt);
    await tx.listing.update({ where: { id }, data: { assignedAgentId: agentId, updatedAt: new Date() } });

    const previous = row.assignedAgentId
      ? await tx.profile.findUnique({ where: { id: row.assignedAgentId }, select: { fullName: true, email: true } })
      : null;
    const leads = await tx.lead.findMany({
      where: { listingId: id, status: { in: [...openLeadStatuses] } },
      select: { id: true },
    });
    if (leads.length > 0) {
      await tx.lead.updateMany({ where: { id: { in: leads.map((lead) => lead.id) } }, data: { assignedAgentId: agentId } });
      const body = `Reassigned from ${previous ? displayName(previous) : "no one"} to ${displayName(target!)} with the listing`;
      await tx.leadActivity.createMany({
        data: leads.map((lead) => ({ leadId: lead.id, actorId: agent.id, type: "SYSTEM" as const, body })),
      });
    }

    reportEvent("listing.reassigned", {
      listing_id: id,
      from_agent_id: row.assignedAgentId,
      to_agent_id: agentId,
      by_agent_id: agent.id,
      moved_leads: leads.length,
    });
    return {
      ok: true,
      updatedAt: await finalToken(tx, id),
      refreshPublic: wasPublic(row),
      movedLeads: leads.length,
      ...(formStale ? { formStale } : {}),
    };
  });
}

// ---------------------------------------------------------------------------
// Photos (AC-8). The link check runs before the transaction, so no row lock is
// held during the outbound request.

export const maxPhotos = 20;

export type PhotoDTO = { id: string; url: string; alt: string; isCover: boolean; sortOrder: number };

const toPhotoDTO = (photo: Prisma.ListingPhotoGetPayload<object>): PhotoDTO => ({
  id: photo.id,
  url: photoUrl(photo),
  alt: photo.alt,
  isCover: photo.isCover,
  sortOrder: photo.sortOrder,
});

export async function addPhoto(agent: AgentUser, listingId: string, expectedUpdatedAt: Date, url: string, alt?: string) {
  const normalized = normalizePhotoUrl(url);
  if (!normalized.ok) return { ok: false, reason: normalized.reason } satisfies ListingFailure;
  const checked = await checkPhotoUrl(url);
  if (!checked.ok) return { ok: false, reason: checked.reason } satisfies ListingFailure;

  return run<{ photo: PhotoDTO }>(async (tx) => {
    const row = await lockListing(tx, listingId);
    if (!canEditListing(row, agent.id)) abort("forbidden");
    if (row.status === "SOLD") abort("stale_status");
    const photos = await tx.listingPhoto.findMany({ where: { listingId }, select: { url: true, sortOrder: true } });
    if (photos.length >= maxPhotos) abort("photo_limit");
    if (photos.some((photo) => photo.url === checked.url)) abort("duplicate");

    const photo = await tx.listingPhoto.create({
      data: {
        listingId,
        url: checked.url,
        alt: alt?.trim() || row.title,
        sortOrder: Math.max(0, ...photos.map((p) => p.sortOrder)) + 1,
        isCover: photos.length === 0,
      },
    });
    const { formStale } = await touchOrForce(tx, listingId, expectedUpdatedAt);
    return {
      ok: true,
      updatedAt: await finalToken(tx, listingId),
      refreshPublic: wasPublic(row),
      photo: toPhotoDTO(photo),
      ...(formStale ? { formStale } : {}),
    };
  });
}

async function photoListing(tx: Prisma.TransactionClient, agent: AgentUser, photoId: string) {
  const photo = await tx.listingPhoto.findUnique({ where: { id: photoId } });
  if (!photo) abort("not_found");
  const row = await lockListing(tx, photo!.listingId);
  if (!canEditListing(row, agent.id)) abort("forbidden");
  if (row.status === "SOLD") abort("stale_status");
  return { photo: photo!, row };
}

async function photoDone(tx: Prisma.TransactionClient, row: ListingRow, expectedUpdatedAt: Date) {
  const { formStale } = await touchOrForce(tx, row.id, expectedUpdatedAt);
  return {
    ok: true as const,
    listingId: row.id,
    updatedAt: await finalToken(tx, row.id),
    refreshPublic: wasPublic(row),
    ...(formStale ? { formStale } : {}),
  };
}

export async function movePhoto(agent: AgentUser, photoId: string, expectedUpdatedAt: Date, direction: "up" | "down") {
  return run(async (tx) => {
    const { photo, row } = await photoListing(tx, agent, photoId);
    const neighbor = await tx.listingPhoto.findFirst({
      where: { listingId: row.id, sortOrder: direction === "up" ? { lt: photo.sortOrder } : { gt: photo.sortOrder } },
      orderBy: { sortOrder: direction === "up" ? "desc" : "asc" },
    });
    if (neighbor) {
      await tx.listingPhoto.update({ where: { id: photo.id }, data: { sortOrder: neighbor.sortOrder } });
      await tx.listingPhoto.update({ where: { id: neighbor.id }, data: { sortOrder: photo.sortOrder } });
    }
    return photoDone(tx, row, expectedUpdatedAt);
  });
}

export async function setCoverPhoto(agent: AgentUser, photoId: string, expectedUpdatedAt: Date) {
  return run(async (tx) => {
    const { row } = await photoListing(tx, agent, photoId);
    await setCover(photoId, agent, tx);
    return photoDone(tx, row, expectedUpdatedAt);
  });
}

export async function updatePhotoAlt(agent: AgentUser, photoId: string, expectedUpdatedAt: Date, alt: string) {
  return run(async (tx) => {
    const { row } = await photoListing(tx, agent, photoId);
    await tx.listingPhoto.update({ where: { id: photoId }, data: { alt } });
    return photoDone(tx, row, expectedUpdatedAt);
  });
}

export async function removePhoto(agent: AgentUser, photoId: string, expectedUpdatedAt: Date) {
  return run(async (tx) => {
    const { photo, row } = await photoListing(tx, agent, photoId);
    await deletePhoto(photoId, agent, tx);
    // A draft or unpublished listing's cover moves to the next photo.
    if (photo.isCover) {
      const next = await tx.listingPhoto.findFirst({ where: { listingId: row.id }, orderBy: { sortOrder: "asc" } });
      if (next) await tx.listingPhoto.update({ where: { id: next.id }, data: { isCover: true } });
    }
    return photoDone(tx, row, expectedUpdatedAt);
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

export const pageSize = 25;

const cursorShape = z.object({ updatedAt: z.iso.datetime(), id: z.uuid() });

function encodeCursor(row: { updatedAt: Date; id: string }) {
  return Buffer.from(JSON.stringify({ updatedAt: row.updatedAt.toISOString(), id: row.id })).toString("base64url");
}

function decodeCursor(cursor: string) {
  try {
    return cursorShape.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
  } catch {
    return null;
  }
}

export type AgencyListingRow = {
  id: string;
  title: string;
  refCode: string;
  propertyType: PropertyType;
  areaName: string;
  priceBdt: number | null;
  status: ListingStatus;
  openLeads: number;
  advisor: string;
};

export async function listAgencyListings(input: {
  tab: ListingTab;
  q: string;
  mine: boolean;
  cursor: string | null;
  agentId: string;
}): Promise<{ rows: AgencyListingRow[]; nextCursor: string | null }> {
  const and: Prisma.ListingWhereInput[] = [];
  const status = tabStatus[input.tab];
  if (status) and.push({ status });
  if (input.mine) and.push({ OR: [{ createdById: input.agentId }, { assignedAgentId: input.agentId }] });
  const q = input.q.trim();
  if (q) and.push({ OR: [{ title: { contains: q, mode: "insensitive" } }, { refCode: q.toUpperCase() }] });
  const cursor = input.cursor ? decodeCursor(input.cursor) : null;
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
      advisor: row.assignedAgent ? displayName(row.assignedAgent) : "Unassigned",
    })),
    nextCursor: rows.length > pageSize && last ? encodeCursor(last) : null,
  };
}

export async function listActiveAgents() {
  const agents = await db.profile.findMany({
    where: { role: "AGENT", deletedAt: null },
    select: { id: true, fullName: true, email: true },
    orderBy: [{ fullName: "asc" }, { email: "asc" }],
  });
  return agents.map((agent) => ({ id: agent.id, fullName: displayName(agent) }));
}

export async function listFormOptions() {
  const [areas, amenities] = await Promise.all([
    db.area.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, nameEn: true } }),
    db.amenity.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, label: true } }),
  ]);
  return { areas, amenities };
}

export type ListingFormValues = Merged & { amenityIds: string[] };

export async function getListingForEdit(id: string, agent: AgentUser) {
  const row = await db.listing.findUnique({
    where: { id },
    include: {
      photos: { orderBy: { sortOrder: "asc" } },
      amenities: { select: { amenityId: true } },
      createdBy: { select: { fullName: true, email: true } },
      assignedAgent: { select: { id: true, fullName: true, email: true } },
    },
  });
  if (!row) return null;
  const values: ListingFormValues = { ...storedValues(row), amenityIds: row.amenities.map((a) => a.amenityId) };
  const photos = row.photos.map(toPhotoDTO);
  return {
    id: row.id,
    refCode: row.refCode,
    slug: row.slug,
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
    values,
    photos,
    assignedAgent: row.assignedAgent ? { id: row.assignedAgent.id, name: displayName(row.assignedAgent) } : null,
    createdBy: displayName(row.createdBy),
    // AC-12 plus the read only SOLD state (AC-10).
    canEdit: canEditListing(row, agent.id) && row.status !== "SOLD",
    isOwner: canEditListing(row, agent.id),
    // After a reassignment, the creator keeps editing rights; anyone else loses them.
    isCreator: row.createdById === agent.id,
    checklist: publishChecklist(values, photos),
  };
}

export type ListingForEdit = NonNullable<Awaited<ReturnType<typeof getListingForEdit>>>;

