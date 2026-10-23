"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  addPhoto as addPhotoService,
  changeStatus,
  createDraft as createDraftService,
  deleteDraft as deleteDraftService,
  draftCreateInput,
  listingPatch,
  movePhoto as movePhotoService,
  publishWithFields,
  reassignListing,
  removePhoto as removePhotoService,
  saveListing as saveListingService,
  setCoverPhoto as setCoverPhotoService,
  updatePhotoAlt as updatePhotoAltService,
  type ListingFailure,
  type ListingSuccess,
} from "@/lib/server/agent-listings";
import { requireAgentAction, type AgentDenial } from "@/lib/server/auth";
import { resolveLocation as resolveLocationService } from "@/lib/server/location";

// Listing actions (spec 0005, *API surface*). Each checks the agent first
// (AC-15), validates with Zod, and leaves the work to `lib/server/agent-listings`.

type Denied = { ok: false; reason: AgentDenial };
type ActionResult<T extends object = object> = ListingSuccess<T> | ListingFailure | Denied;

const token = z.iso.datetime({ offset: true }).transform((value) => new Date(value));
const invalid: ListingFailure = { ok: false, reason: "invalid" };

// Public listing pages refresh after the transaction commits (spec 0005, *Cache*).
function refresh<T extends object>(id: string, result: ListingSuccess<T> | ListingFailure) {
  if (result.ok && result.refreshPublic) {
    updateTag(`listing:${id}`);
    updateTag("listings");
  }
  return result;
}

export async function createDraft(input: z.input<typeof draftCreateInput>) {
  const agent = await requireAgentAction();
  if (!agent.ok) return agent;
  const parsed = draftCreateInput.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { ok: false as const, reason: "invalid" as const, fieldErrors };
  }
  const result = await createDraftService(agent.user, parsed.data);
  if (!result.ok) return result;
  redirect(`/dashboard/listings/${result.id}`);
}

const saveInput = z.object({ id: z.uuid(), expectedUpdatedAt: token, fields: listingPatch });

export async function saveListing(input: z.input<typeof saveInput>): Promise<ActionResult> {
  const agent = await requireAgentAction();
  if (!agent.ok) return agent;
  const parsed = saveInput.safeParse(input);
  if (!parsed.success) return invalid;
  const { id, expectedUpdatedAt, fields } = parsed.data;
  return refresh(id, await saveListingService(agent.user, id, expectedUpdatedAt, fields));
}

export async function publish(input: z.input<typeof saveInput>): Promise<ActionResult> {
  const agent = await requireAgentAction();
  if (!agent.ok) return agent;
  const parsed = saveInput.safeParse(input);
  if (!parsed.success) return invalid;
  const { id, expectedUpdatedAt, fields } = parsed.data;
  return refresh(id, await publishWithFields(agent.user, id, expectedUpdatedAt, fields));
}

export async function resolveLocation(input: { input: string }) {
  const agent = await requireAgentAction();
  if (!agent.ok) return agent;
  const parsed = z.object({ input: z.string().max(2000) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "location_unreadable" as const };
  return resolveLocationService(parsed.data.input);
}

const statusInput = z.object({ id: z.uuid(), expectedUpdatedAt: token });

export async function unpublish(input: z.input<typeof statusInput>): Promise<ActionResult> {
  const agent = await requireAgentAction();
  if (!agent.ok) return agent;
  const parsed = statusInput.safeParse(input);
  if (!parsed.success) return invalid;
  return refresh(parsed.data.id, await changeStatus(agent.user, parsed.data.id, parsed.data.expectedUpdatedAt, "UNPUBLISHED"));
}

export async function markSold(input: z.input<typeof statusInput>): Promise<ActionResult> {
  const agent = await requireAgentAction();
  if (!agent.ok) return agent;
  const parsed = statusInput.safeParse(input);
  if (!parsed.success) return invalid;
  return refresh(parsed.data.id, await changeStatus(agent.user, parsed.data.id, parsed.data.expectedUpdatedAt, "SOLD"));
}

export async function deleteDraft(input: { id: string }) {
  const agent = await requireAgentAction();
  if (!agent.ok) return agent;
  const parsed = z.object({ id: z.uuid() }).safeParse(input);
  if (!parsed.success) return invalid;
  const result = await deleteDraftService(agent.user, parsed.data.id);
  if (!result.ok) return result;
  redirect("/dashboard/listings");
}

const reassignInput = statusInput.extend({ agentId: z.uuid() });

export async function reassign(input: z.input<typeof reassignInput>): Promise<ActionResult<{ movedLeads: number }>> {
  const agent = await requireAgentAction();
  if (!agent.ok) return agent;
  const parsed = reassignInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid_agent" };
  const { id, expectedUpdatedAt, agentId } = parsed.data;
  return refresh(id, await reassignListing(agent.user, id, expectedUpdatedAt, agentId));
}

// ---------------------------------------------------------------------------
// Photos (AC-8).

const addPhotoInput = z.object({
  listingId: z.uuid(),
  expectedUpdatedAt: token,
  url: z.string().trim().min(1).max(2000),
  alt: z.string().trim().max(160).optional(),
});

export async function addPhoto(input: z.input<typeof addPhotoInput>) {
  const agent = await requireAgentAction();
  if (!agent.ok) return agent;
  const parsed = addPhotoInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "host_not_allowed" as const };
  const { listingId, expectedUpdatedAt, url, alt } = parsed.data;
  return refresh(listingId, await addPhotoService(agent.user, listingId, expectedUpdatedAt, url, alt));
}

const photoInput = z.object({ photoId: z.uuid(), expectedUpdatedAt: token });

// The listing to refresh comes from the photo row, never from the browser.
const refreshPhoto = (result: ListingSuccess<{ listingId: string }> | ListingFailure) =>
  result.ok ? refresh(result.listingId, result) : result;

export async function movePhoto(input: z.input<typeof photoInput> & { direction: "up" | "down" }): Promise<ActionResult> {
  const agent = await requireAgentAction();
  if (!agent.ok) return agent;
  const parsed = photoInput.extend({ direction: z.enum(["up", "down"]) }).safeParse(input);
  if (!parsed.success) return invalid;
  const { photoId, expectedUpdatedAt, direction } = parsed.data;
  return refreshPhoto(await movePhotoService(agent.user, photoId, expectedUpdatedAt, direction));
}

export async function setCoverPhoto(input: z.input<typeof photoInput>): Promise<ActionResult> {
  const agent = await requireAgentAction();
  if (!agent.ok) return agent;
  const parsed = photoInput.safeParse(input);
  if (!parsed.success) return invalid;
  const { photoId, expectedUpdatedAt } = parsed.data;
  return refreshPhoto(await setCoverPhotoService(agent.user, photoId, expectedUpdatedAt));
}

export async function updatePhotoAlt(input: z.input<typeof photoInput> & { alt: string }): Promise<ActionResult> {
  const agent = await requireAgentAction();
  if (!agent.ok) return agent;
  const parsed = photoInput.extend({ alt: z.string().trim().min(1).max(160) }).safeParse(input);
  if (!parsed.success) return invalid;
  const { photoId, expectedUpdatedAt, alt } = parsed.data;
  return refreshPhoto(await updatePhotoAltService(agent.user, photoId, expectedUpdatedAt, alt));
}

export async function removePhoto(input: z.input<typeof photoInput>): Promise<ActionResult> {
  const agent = await requireAgentAction();
  if (!agent.ok) return agent;
  const parsed = photoInput.safeParse(input);
  if (!parsed.success) return invalid;
  const { photoId, expectedUpdatedAt } = parsed.data;
  return refreshPhoto(await removePhotoService(agent.user, photoId, expectedUpdatedAt));
}
