import { InvalidTransitionError } from "@/lib/domain/errors";
import type { ListingStatus, UserRole } from "@/lib/generated/prisma/enums";

// Listing state machine (spec 0002 "State transitions"). Pure: says which moves
// each role may make. Ownership is checked by `transitionListing`.

type Rule = { from: ListingStatus; to: ListingStatus; role: UserRole; review?: true };

const rules: Rule[] = [
  // Agent on own or assigned listings.
  { from: "DRAFT", to: "PUBLISHED", role: "AGENT" },
  { from: "PUBLISHED", to: "UNPUBLISHED", role: "AGENT" },
  { from: "UNPUBLISHED", to: "PUBLISHED", role: "AGENT" },
  { from: "PUBLISHED", to: "SOLD", role: "AGENT" },
  { from: "UNPUBLISHED", to: "SOLD", role: "AGENT" },
  // Seller on own listings.
  { from: "DRAFT", to: "PENDING_REVIEW", role: "SELLER" },
  { from: "CHANGES_REQUESTED", to: "PENDING_REVIEW", role: "SELLER" },
  // Any agent reviewing a seller's listing.
  { from: "PENDING_REVIEW", to: "PUBLISHED", role: "AGENT", review: true },
  { from: "PENDING_REVIEW", to: "CHANGES_REQUESTED", role: "AGENT", review: true },
  { from: "PENDING_REVIEW", to: "REJECTED", role: "AGENT", review: true },
];

// Returns the matching rule; `review` means any agent may make it, not only the owner.
export function assertListingTransition(from: ListingStatus, to: ListingStatus, actor: { role: UserRole }) {
  const rule = rules.find((r) => r.from === from && r.to === to && r.role === actor.role);
  if (!rule) throw new InvalidTransitionError("listing", from, to);
  return { review: rule.review === true };
}
