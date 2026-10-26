import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { terms } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms for using the Aurevia Estates website and the Aurevia Assistant.",
};

// `/terms` (spec 0017, AC-1): prerendered.
export default function TermsPage() {
  return <LegalPage doc={terms} />;
}
