import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/layout";
import { Showcase } from "./showcase";

export const metadata: Metadata = { title: "Styleguide", robots: { index: false } };

// Dev only (spec 0003 AC-8): 404 in production unless ENABLE_STYLEGUIDE=true,
// which only the CI axe job sets. Decided at build time on purpose: a check inside
// a streamed section can't change a 200 that was already sent. Read directly from
// process.env (not `serverEnv()`) so the build needs no runtime secrets.
export default function StyleguidePage() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_STYLEGUIDE !== "true") notFound();

  return (
    <Container className="py-12">
      <Showcase />
    </Container>
  );
}
