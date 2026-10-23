// What the listing pages say for each failure reason (spec 0005, *Error messages*).
// Shared by the actions (which return a reason) and the client forms.

export const listingMessages = {
  forbidden: "Only the listing's creator or assigned agent can change it.",
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
  not_found: "This listing no longer exists.",
  signed_out: "Your session ended. Sign in again to continue.",
  mfa_required: "Enter a code from your authenticator app to continue.",
} as const;

export type ListingMessageReason = keyof typeof listingMessages;
