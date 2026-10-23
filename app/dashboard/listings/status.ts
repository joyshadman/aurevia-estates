import type { ListingStatus } from "@/lib/generated/prisma/enums";

// Status badges in the listing table and the edit page's side panel.
export const statusBadge: Record<ListingStatus, { label: string; tone: "neutral" | "accent" | "success" | "warning" | "danger" }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  PENDING_REVIEW: { label: "In review", tone: "warning" },
  CHANGES_REQUESTED: { label: "Changes requested", tone: "warning" },
  REJECTED: { label: "Rejected", tone: "danger" },
  PUBLISHED: { label: "Published", tone: "success" },
  UNPUBLISHED: { label: "Unpublished", tone: "warning" },
  SOLD: { label: "Sold", tone: "accent" },
};
