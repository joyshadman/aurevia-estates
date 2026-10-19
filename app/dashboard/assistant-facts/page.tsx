import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAgent } from "@/lib/server/auth";
import { factSheetVersions } from "@/lib/server/fact-sheet";
import { FactSheetEditor } from "./fact-sheet-editor";

export const metadata: Metadata = { title: "Assistant facts" };

export default function AssistantFactsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[480px] w-full rounded-2xl" />}>
      <Facts />
    </Suspense>
  );
}

async function Facts() {
  await requireAgent({ next: "/dashboard/assistant-facts" });
  const versions = await factSheetVersions();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl text-fg">Assistant facts</h1>
        <p className="mt-1 max-w-2xl text-sm text-fg-muted">
          What the assistant may say about the agency: hours, fees, areas, how viewings work. It goes into every reply,
          so keep it short and true. Anything in [square brackets] is never repeated to buyers.
        </p>
      </div>
      <FactSheetEditor key={versions[0]?.id ?? "none"} versions={versions} />
    </div>
  );
}
