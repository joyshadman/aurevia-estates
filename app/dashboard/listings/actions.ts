"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import type { ListingActionFailure, ListingActionResult } from "@/lib/domain/listing-messages";
import * as listings from "@/lib/server/agent-listings";
import { requireAgentAction } from "@/lib/server/auth";
import { resolveLocation, type LocationResult } from "@/lib/server/location";

// Agent listing actions (spec 0005, "API surface"). Each one passes the agent
// gate first (AC-15), then the service rechecks editing rights under a row lock
// (AC-12). Public caches refresh only when a public listing changed.

type Internal<T> = ListingActionResult<T & { publicChanged?: boolean; listingId?: string }>;

async function agent() {
  const result = await requireAgentAction();
  return "ok" in result ? { denied: result as ListingActionFailure } : { user: result };
}

// Refreshes public listing reads (features 10 to 12) after the transaction commits.
function settle<T extends object>(result: Internal<T>, listingId?: string): ListingActionResult<T> {
  if (!result.ok) return result;
  const { publicChanged, listingId: fromResult, ...rest } = result;
  const id = fromResult ?? listingId;
  if (publicChanged && id) {
    updateTag(`listing:${id}`);
    updateTag("listings");
  }
  return rest as unknown as ListingActionResult<T>;
}

export type NewListingState = ListingActionFailure | null;

export async function createDraftAction(_previous: NewListingState, form: FormData): Promise<NewListingState> {
  const { user, denied } = await agent();
  if (denied) return denied;
  const result = await listings.createDraft(
    {
      title: String(form.get("title") ?? ""),
      propertyType: String(form.get("propertyType") ?? "") as never,
      areaId: String(form.get("areaId") ?? ""),
    },
    user,
  );
  if (!result.ok) return result;
  redirect(`/dashboard/listings/${result.id}`);
}

export async function saveListingAction(input: listings.SaveInput) {
  const { user, denied } = await agent();
  if (denied) return denied;
  return settle(await listings.saveListing(input, user), input.id);
}

export async function publishListingAction(input: listings.SaveInput) {
  const { user, denied } = await agent();
  if (denied) return denied;
  return settle(await listings.publishWithSave(input, user), input.id);
}

export async function resolveLocationAction(input: string): Promise<LocationResult | ListingActionFailure> {
  const { denied } = await agent();
  if (denied) return denied;
  return resolveLocation(String(input).slice(0, 2000));
}

export async function addPhotoAction(input: { listingId: string; expectedUpdatedAt: string; url: string; alt?: string }) {
  const { user, denied } = await agent();
  if (denied) return denied;
  return settle(await listings.addPhoto(input, user));
}

export async function movePhotoAction(input: { photoId: string; expectedUpdatedAt: string; direction: "up" | "down" }) {
  const { user, denied } = await agent();
  if (denied) return denied;
  return settle(await listings.movePhoto(input, user));
}

export async function setCoverPhotoAction(input: { photoId: string; expectedUpdatedAt: string }) {
  const { user, denied } = await agent();
  if (denied) return denied;
  return settle(await listings.setCoverPhoto(input, user));
}

export async function updatePhotoAltAction(input: { photoId: string; expectedUpdatedAt: string; alt: string }) {
  const { user, denied } = await agent();
  if (denied) return denied;
  return settle(await listings.updatePhotoAlt(input, user));
}

export async function removePhotoAction(input: { photoId: string; expectedUpdatedAt: string }) {
  const { user, denied } = await agent();
  if (denied) return denied;
  return settle(await listings.removePhoto(input, user));
}

export async function unpublishAction(input: { id: string; expectedUpdatedAt: string }) {
  const { user, denied } = await agent();
  if (denied) return denied;
  return settle(await listings.unpublishListing(input, user), input.id);
}

export async function markSoldAction(input: { id: string; expectedUpdatedAt: string }) {
  const { user, denied } = await agent();
  if (denied) return denied;
  return settle(await listings.markListingSold(input, user), input.id);
}

export async function reassignAction(input: { id: string; expectedUpdatedAt: string; agentId: string }) {
  const { user, denied } = await agent();
  if (denied) return denied;
  return settle(await listings.reassignListing(input, user), input.id);
}

// A draft was never public, so no cache refresh.
export async function deleteDraftAction(input: { id: string }): Promise<ListingActionFailure> {
  const { user, denied } = await agent();
  if (denied) return denied;
  const result = await listings.deleteDraft(input, user);
  if (!result.ok) return result;
  redirect("/dashboard/listings");
}
