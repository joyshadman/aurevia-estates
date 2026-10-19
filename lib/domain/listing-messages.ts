// What every agent listing action can answer, and what the form says (spec 0005,
// "Error messages"). Pure, so pages and client components share it.

export const listingReasonMessages = {
  forbidden: "Only the listing's creator or assigned agent can change it.",
  not_found: "That listing no longer exists.",
  signed_out: "Your session ended. Sign in again to continue.",
  mfa_required: "Confirm your authenticator code to continue.",
  stale: "Someone else updated this listing. Reload to see their changes.",
  stale_status: "This listing's status just changed. Reload to see it.",
  invalid: "Check the highlighted fields.",
  incomplete: "To publish, add:",
  location_unreadable: "We couldn't read a location from that. Paste the coordinates instead, like 24.8949, 91.8687.",
  outside_bangladesh: "That location is outside Bangladesh. Check the link.",
  host_not_allowed: "Use a photo link from Unsplash, Imgur, Cloudinary, or Google Drive.",
  redirect_not_allowed: "That link redirects somewhere we don't accept. Use the direct image link.",
  not_an_image: "That link isn't an image. Use the direct image link.",
  drive_not_shared: 'We can\'t open that Drive file. Share it with "Anyone with the link".',
  image_removed: "That image was removed from Imgur.",
  too_large: "That image is over 15 MB.",
  unreachable: "We couldn't reach that link. Check it and try again.",
  duplicate: "That photo is already on this listing.",
  photo_limit: "A listing can have up to 20 photos.",
  last_cover: "A published listing needs a cover. Pick another cover first.",
  not_deletable: "Only drafts can be deleted. Unpublish it instead.",
  invalid_agent: "Choose an active agent.",
} as const;

export type ListingReason = keyof typeof listingReasonMessages;

export type ListingActionFailure = {
  ok: false;
  reason: ListingReason;
  missing?: string[];
  fieldErrors?: Record<string, string>;
};

// `updatedAt` is the new conflict token the form keeps; `formStale` means the
// change applied but the form missed someone else's edit (AC-13).
export type ListingActionSuccess<T = object> = { ok: true; updatedAt: string; formStale?: true } & T;

export type ListingActionResult<T = object> = ListingActionSuccess<T> | ListingActionFailure;

export function listingFailureMessage(result: ListingActionFailure): string {
  const base = listingReasonMessages[result.reason];
  return result.reason === "incomplete" && result.missing?.length ? `${base} ${result.missing.join(", ")}.` : base;
}
