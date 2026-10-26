import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { privacy } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Aurevia Estates collects, why, who handles it, and how to delete it.",
};

// `/privacy` (spec 0017, AC-1): prerendered.
export default function PrivacyPage() {
  return <LegalPage doc={privacy} />;
}
