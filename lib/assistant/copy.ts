import type { ChatLocale } from "@/lib/domain/chat-text";
import type { PropertyType } from "@/lib/domain/listing-card";

// Fixed assistant copy in English and Bangla (spec 0006, *Greeting and chips*,
// *Brief pane*). Client side only; nothing here is sent to the model.
// The Bangla strings want a native speaker's pass before launch.

export const greeting: Record<ChatLocale, string> = {
  en: "Hello, I'm the Aurevia Assistant. Tell me your budget, the areas you like, and how your family lives, and I'll find homes that fit.",
  bn: "হ্যালো, আমি অরেভিয়া অ্যাসিস্ট্যান্ট। আপনার বাজেট, পছন্দের এলাকা আর পরিবারের কথা বলুন, আমি মানানসই বাড়ি খুঁজে দেব।",
};

export function startingGreeting(locale: ChatLocale, title: string, area: string): string {
  return locale === "bn"
    ? `হ্যালো। আপনি ${area}-এর ${title} সম্পর্কে জানতে চাইছেন। কী জানতে চান, নাকি এর মতো আরও বাড়ি খুঁজব?`
    : `Hello. You're asking about ${title} in ${area}. What would you like to know, or shall I find similar homes?`;
}

export type ChipStage = "empty" | "results" | "details";

// "Book a viewing" joins the results chips once feature 8 is live.
export const chips: Record<ChipStage, Record<ChatLocale, string[]>> = {
  empty: {
    en: ["Family home under 2 crore", "Apartment in Zindabazar", "Plot of land in Tilagor", "What areas do you cover?"],
    bn: ["২ কোটির মধ্যে পারিবারিক বাড়ি", "জিন্দাবাজারে অ্যাপার্টমেন্ট", "টিলাগড়ে জমির প্লট", "আপনারা কোন কোন এলাকায় কাজ করেন?"],
  },
  results: {
    en: ["Show cheaper options", "Only ready to move in", "Compare price per sqft"],
    bn: ["আরও কম দামের বাড়ি দেখান", "শুধু রেডি বাড়ি", "প্রতি বর্গফুটের দাম তুলনা করুন"],
  },
  details: {
    en: ["What's nearby?", "Show similar homes", "How do viewings work?"],
    bn: ["আশেপাশে কী আছে?", "এরকম আরও বাড়ি দেখান", "বাড়ি দেখার ব্যবস্থা কীভাবে হয়?"],
  },
};

export const propertyTypeLabelsBn: Record<PropertyType, string> = {
  APARTMENT: "অ্যাপার্টমেন্ট",
  DUPLEX: "ডুপ্লেক্স",
  VILLA: "ভিলা",
  HOUSE: "বাড়ি",
  PLOT: "প্লট",
  COMMERCIAL: "বাণিজ্যিক",
};

// The note saved when a visitor removes a brief item (AC-12).
export function removalNote(locale: ChatLocale, label: string): string {
  return locale === "bn" ? `আপনি আপনার চাহিদা থেকে ${label} সরিয়েছেন।` : `You removed ${label} from your brief.`;
}

export const briefItemLabels = {
  budget: { en: "your budget", bn: "আপনার বাজেট" },
  minBedrooms: { en: "the bedroom count", bn: "শোবার ঘরের সংখ্যা" },
  minBathrooms: { en: "the bathroom count", bn: "বাথরুমের সংখ্যা" },
  familySize: { en: "the household size", bn: "পরিবারের সদস্য সংখ্যা" },
  notes: { en: "your notes", bn: "আপনার নোট" },
} as const;
