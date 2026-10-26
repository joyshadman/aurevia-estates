import type { ChatLocale } from "@/lib/domain/bangla";

// Suggestion chips (spec 0006, AC-16): a fixed set per stage, in the toggle's
// language. Tapping one sends it as the visitor's message.

export type ChipStage = "empty" | "results" | "details";

type Chip = { en: string; bn: string; visitorOnly?: true };

const chips: Record<ChipStage, Chip[]> = {
  empty: [
    { en: "Family home under 2 crore", bn: "২ কোটির মধ্যে পরিবারের জন্য বাড়ি" },
    { en: "Apartment in Zindabazar", bn: "জিন্দাবাজারে অ্যাপার্টমেন্ট" },
    { en: "Plot of land in Tilagor", bn: "টিলাগড়ে জমির প্লট" },
    { en: "What areas do you cover?", bn: "আপনারা কোন কোন এলাকায় কাজ করেন?" },
  ],
  results: [
    { en: "Show cheaper options", bn: "আরও কম দামের বাড়ি দেখান" },
    { en: "Only ready to move in", bn: "শুধু এখনই ওঠা যায় এমন বাড়ি" },
    { en: "Compare price per sqft", bn: "প্রতি বর্গফুটের দাম তুলনা করুন" },
    // Feature 8 is live; only buyers get a booking card (spec 0007).
    { en: "Book a viewing", bn: "বাড়ি দেখার সময় নিন", visitorOnly: true },
  ],
  details: [
    { en: "What's nearby?", bn: "আশেপাশে কী আছে?" },
    { en: "Show similar homes", bn: "এর মতো আরও বাড়ি দেখান" },
    { en: "How do viewings work?", bn: "বাড়ি দেখা কীভাবে হয়?" },
  ],
};

export function stageChips(stage: ChipStage, locale: ChatLocale, { visitor }: { visitor: boolean }): string[] {
  return chips[stage].filter((chip) => visitor || !chip.visitorOnly).map((chip) => chip[locale]);
}
