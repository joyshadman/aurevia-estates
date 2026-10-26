import type { LeadSource, LeadStatus } from "@/lib/generated/prisma/enums";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

// Lead status badges in the inbox table and on the lead page.
export const leadStatusBadge: Record<LeadStatus, { label: string; tone: Tone }> = {
  NEW: { label: "New", tone: "accent" },
  CONTACTED: { label: "Contacted", tone: "neutral" },
  QUALIFIED: { label: "Qualified", tone: "warning" },
  WON: { label: "Won", tone: "success" },
  LOST: { label: "Lost", tone: "danger" },
};

// The lead page's move buttons (spec 0009, AC-11).
export const moveLabels: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Mark contacted",
  QUALIFIED: "Qualified",
  WON: "Won",
  LOST: "Lost",
};

export const sourceLabels: Record<LeadSource, string> = {
  CHAT_BOOKING: "Booked in the assistant",
  CONTACT_FORM: "Contact form",
  LISTING_INQUIRY: "Listing enquiry",
};
