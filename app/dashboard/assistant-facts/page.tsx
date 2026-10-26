import type { Metadata } from "next";
import { Suspense } from "react";
import { Eyebrow } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/state";
import { factSheetVersions } from "@/lib/server/assistant/fact-sheet";
import { requireAgent } from "@/lib/server/auth";
import { FactSheetEditor } from "./fact-sheet-editor";

export const metadata: Metadata = { title: "Assistant facts" };

// `/dashboard/assistant-facts` (spec 0006, AC-14): the agency fact sheet the
// assistant answers from, with every saved version and restore.
export default function AssistantFactsPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <Eyebrow>Agent dashboard</Eyebrow>
        <h1 className="mt-2 font-display text-3xl text-fg sm:text-4xl">Assistant facts</h1>
        <p className="mt-2 max-w-2xl text-sm text-fg-muted">
          What the assistant may say about the agency: address, office hours, fees, the areas you cover, and how viewings work.
          A save goes live on the next reply. Anything in square brackets is never said; the assistant hands it to an advisor.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <FactSheetContent />
      </Suspense>
    </div>
  );
}

async function FactSheetContent() {
  await requireAgent({ next: "/dashboard/assistant-facts" });
  const versions = await factSheetVersions();
  if (versions.length === 0) {
    return <EmptyState title="No fact sheet yet" body="Run the database seed to create the first version, then come back here to edit it." />;
  }
  // A new live version remounts the editor with its body (after a save or a restore).
  return <FactSheetEditor key={versions[0].id} versions={versions} />;
}
