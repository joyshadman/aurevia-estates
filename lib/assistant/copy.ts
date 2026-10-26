import { toBanglaDigits, type ChatLocale } from "@/lib/domain/bangla";
import { propertyTypeLabels, type PropertyType } from "@/lib/domain/listing-card";
import { formatPrice } from "@/lib/format";

// The chat's words in English and Bangla (spec 0006, *Greeting and chips*,
// *Brief pane*). Pure, shared by the chat page and the server's brief notes.

export type GreetingListing = { title: string; areaNameEn: string; areaNameBn: string };

// Client side only, never saved (AC-8, AC-13).
export function greeting(locale: ChatLocale, listing: GreetingListing | null): string {
  if (listing) {
    return locale === "bn"
      ? `হ্যালো। আপনি ${listing.areaNameBn}-এর ${listing.title} সম্পর্কে জানতে চাইছেন। কী জানতে চান, নাকি এর মতো আরও বাড়ি খুঁজে দেব?`
      : `Hello. You're asking about ${listing.title} in ${listing.areaNameEn}. What would you like to know, or shall I find similar homes?`;
  }
  return locale === "bn"
    ? "হ্যালো, আমি অরেভিয়া অ্যাসিস্ট্যান্ট। আপনার বাজেট, পছন্দের এলাকা আর পরিবার কীভাবে থাকে তা জানান, আমি মানানসই বাড়ি খুঁজে দেব।"
    : "Hello, I'm the Aurevia Assistant. Tell me your budget, the areas you like, and how your family lives, and I'll find homes that fit.";
}

const propertyTypeLabelsBn: Record<PropertyType, string> = {
  APARTMENT: "অ্যাপার্টমেন্ট",
  DUPLEX: "ডুপ্লেক্স",
  VILLA: "ভিলা",
  HOUSE: "বাড়ি",
  PLOT: "প্লট",
  COMMERCIAL: "বাণিজ্যিক",
};

export function propertyTypeLabel(type: PropertyType, locale: ChatLocale): string {
  return locale === "bn" ? propertyTypeLabelsBn[type] : propertyTypeLabels[type];
}

// "Up to BDT 25,000,000" (spec 0006, *Brief pane*).
export function budgetLabel(min: number | null, max: number | null): string | null {
  if (min !== null && max !== null) return `${formatPrice(min)} to ${formatPrice(max)}`;
  if (max !== null) return `Up to ${formatPrice(max)}`;
  if (min !== null) return `From ${formatPrice(min)}`;
  return null;
}

// What a removal note calls each item: "You removed Shibgonj from your brief."
export type RemovedItem =
  | { field: "budget" | "familySize" | "notes" }
  | { field: "minBedrooms" | "minBathrooms"; count: number }
  | { field: "value"; label: string };

function itemLabel(item: RemovedItem, locale: ChatLocale): string {
  const bn = locale === "bn";
  switch (item.field) {
    case "budget":
      return bn ? "বাজেট" : "the budget";
    case "familySize":
      return bn ? "পরিবারের সদস্যসংখ্যা" : "the household size";
    case "notes":
      return bn ? "অন্যান্য চাহিদা" : "the other needs";
    case "minBedrooms":
      return bn ? `${toBanglaDigits(item.count)}+ শোবার ঘর` : `${item.count}+ bedrooms`;
    case "minBathrooms":
      return bn ? `${toBanglaDigits(item.count)}+ বাথরুম` : `${item.count}+ bathrooms`;
    case "value":
      return item.label;
  }
}

// AC-12: saved as a SYSTEM message; the assistant reads it on the next turn.
export function removalNote(item: RemovedItem, locale: ChatLocale): string {
  const label = itemLabel(item, locale);
  return locale === "bn" ? `আপনি আপনার চাহিদার তালিকা থেকে ${label} সরিয়ে দিয়েছেন।` : `You removed ${label} from your brief.`;
}

// Show more after the brief changed starts over (spec 0006, *Show more*).
export function updatedBriefLabel(locale: ChatLocale): string {
  return locale === "bn" ? "আপনার হালনাগাদ চাহিদা অনুযায়ী ফলাফল" : "Results for your updated brief";
}
