import { Badge } from "@/components/ui/badge";
import type { ListingStatus } from "@/lib/generated/prisma/enums";

const statusDisplay: Record<ListingStatus, { label: string; tone: "neutral" | "accent" | "success" | "warning" | "danger" }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  PUBLISHED: { label: "Published", tone: "success" },
  UNPUBLISHED: { label: "Unpublished", tone: "warning" },
  SOLD: { label: "Sold", tone: "accent" },
  PENDING_REVIEW: { label: "In review", tone: "neutral" },
  CHANGES_REQUESTED: { label: "Changes requested", tone: "warning" },
  REJECTED: { label: "Rejected", tone: "danger" },
};

export function ListingStatusBadge({ status }: { status: ListingStatus }) {
  const { label, tone } = statusDisplay[status];
  return <Badge tone={tone}>{label}</Badge>;
}
