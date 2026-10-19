import { Badge } from "@/components/ui/badge";
import type { LeadSource, LeadStatus, ViewingStatus } from "@/lib/generated/prisma/enums";

const leadTone: Record<LeadStatus, "neutral" | "accent" | "success" | "warning" | "danger"> = {
  NEW: "accent",
  CONTACTED: "warning",
  QUALIFIED: "success",
  WON: "success",
  LOST: "neutral",
};
const leadLabel: Record<LeadStatus, string> = { NEW: "New", CONTACTED: "Contacted", QUALIFIED: "Qualified", WON: "Won", LOST: "Lost" };

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return <Badge tone={leadTone[status]}>{leadLabel[status]}</Badge>;
}

const viewingLabel: Record<ViewingStatus, string> = {
  REQUESTED: "Requested",
  CONFIRMED: "Confirmed",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No show",
};

export function ViewingStatusBadge({ status }: { status: ViewingStatus }) {
  const tone = status === "REQUESTED" ? "accent" : status === "CONFIRMED" || status === "COMPLETED" ? "success" : status === "NO_SHOW" ? "warning" : "neutral";
  return <Badge tone={tone}>{viewingLabel[status]}</Badge>;
}

export const leadSourceLabels: Record<LeadSource, string> = {
  CHAT_BOOKING: "AI Assistant",
  CONTACT_FORM: "Contact form",
  LISTING_INQUIRY: "Listing enquiry",
};

const sylhet = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Dhaka",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
export const formatSylhet = (iso: string) => sylhet.format(new Date(iso));
const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric" });
export const formatSylhetDate = (iso: string) => day.format(new Date(iso));
