import "server-only";
import { generateText } from "ai";
import { propertyTypeLabels } from "@/lib/domain/listing-card";
import { chatModel } from "@/lib/server/assistant/model";
import { recordUsage, refundChatSlot, reserveChatSlot } from "@/lib/server/ai-usage";
import type { AgentUser } from "@/lib/server/auth";
import { canEditListing, type ListingPatch } from "@/lib/server/agent-listings";
import { db } from "@/lib/server/db";
import { reportError } from "@/lib/server/report";

// AI listing descriptions (spec 0021). A draft is built from the editor's
// current fields and only fills the description box in the browser: nothing
// is written to the listing here (AC-3). The agent edits, then saves.

export const dailyDraftLimit = 30;
const timeoutMs = 45_000;

export type DraftResult =
  | { ok: true; text: string }
  | { ok: false; reason: "forbidden" | "not_found" | "draft_limit" | "draft_failed" };

// The rules the model writes under (spec 0021, *Rules given to the model*).
const instructions = `You write property listing descriptions for Aurevia Estates, an agency in Sylhet, Bangladesh.
Write in English, 60 to 160 words, in two or three short paragraphs of plain text. With few facts, stay short rather than pad.
Use only the facts given. Never invent views, distances, nearby places, schools, materials, finishes, legal status, or anything else not listed.
Never mention the price, a discount, or whether it is negotiable.
No markdown, headings, bullet points, emoji, or exclamation marks. No superlatives such as "best", "luxurious", or "stunning" unless a given fact supports them.
If a fact is not given, leave it out. Do not say it is unknown.
Return only the description.`;

// The facts, one per line, only those the agent filled in (AC-2).
async function factsFrom(fields: ListingPatch): Promise<string[]> {
  const [area, amenities] = await Promise.all([
    fields.areaId ? db.area.findUnique({ where: { id: fields.areaId }, select: { nameEn: true } }) : null,
    fields.amenityIds?.length
      ? db.amenity.findMany({ where: { id: { in: fields.amenityIds } }, select: { label: true }, orderBy: { sortOrder: "asc" } })
      : [],
  ]);
  const facts: (string | null)[] = [
    fields.title ? `Title: ${fields.title}` : null,
    fields.propertyType ? `Type: ${propertyTypeLabels[fields.propertyType]}` : null,
    area ? `Area: ${area.nameEn}, Sylhet` : null,
    fields.bedrooms != null ? `Bedrooms: ${fields.bedrooms}` : null,
    fields.bathrooms != null ? `Bathrooms: ${fields.bathrooms}` : null,
    fields.builtUpSqft != null ? `Built up area: ${fields.builtUpSqft} sq ft` : null,
    fields.landKatha != null ? `Land: ${fields.landKatha} katha` : null,
    fields.floorNumber != null ? `Floor: ${fields.floorNumber}` : null,
    fields.totalFloors != null ? `Floors in the building: ${fields.totalFloors}` : null,
    fields.parkingSpaces != null ? `Parking spaces: ${fields.parkingSpaces}` : null,
    fields.completionStatus === "READY" ? "Ready to move in" : null,
    fields.completionStatus === "UNDER_CONSTRUCTION"
      ? `Under construction${fields.handoverDate ? `, handover ${fields.handoverDate}` : ""}`
      : null,
    amenities.length > 0 ? `Amenities: ${amenities.map((amenity) => amenity.label).join(", ")}` : null,
  ];
  return facts.filter((fact): fact is string => fact !== null);
}

export async function draftDescription(agent: AgentUser, listingId: string, fields: ListingPatch): Promise<DraftResult> {
  // AC-4: only an agent who can edit this listing.
  const listing = await db.listing.findUnique({ where: { id: listingId }, select: { createdById: true, assignedAgentId: true } });
  if (!listing) return { ok: false, reason: "not_found" };
  if (!canEditListing(listing, agent.id)) return { ok: false, reason: "forbidden" };

  const slot = await reserveChatSlot(agent.id, dailyDraftLimit);
  if (!slot) return { ok: false, reason: "draft_limit" };

  try {
    const facts = await factsFrom(fields);
    const result = await generateText({
      model: chatModel(),
      instructions,
      prompt: `Facts:\n${facts.join("\n")}`,
      temperature: 0.4,
      maxOutputTokens: 600,
      timeout: { totalMs: timeoutMs },
    });
    await recordUsage(agent.id, { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, messages: 0 });
    const text = result.text.trim();
    if (!text) throw new Error("Empty draft");
    return { ok: true, text };
  } catch (error) {
    // AC-5: a failed draft doesn't use up one of the day's drafts.
    await refundChatSlot(agent.id, slot).catch(() => undefined);
    reportError("listing.draft_failed", error, { listingId });
    return { ok: false, reason: "draft_failed" };
  }
}
