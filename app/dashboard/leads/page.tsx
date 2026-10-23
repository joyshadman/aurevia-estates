import type { Metadata } from "next";
import { Suspense } from "react";
import { Eyebrow } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/state";
import { requireAgent } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Leads" };

const path = "/dashboard/leads";

// The agent landing page (spec 0004, AC-12). A placeholder until the lead inbox
// (feature 9) fills it; the gate is real now (AC-8). Every page under
// `app/dashboard` calls `requireAgent()` itself.
export default function LeadsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <Leads />
    </Suspense>
  );
}

async function Leads() {
  const agent = await requireAgent({ next: path });
  return (
    <div className="flex flex-col gap-8">
      <div>
        <Eyebrow>Agent dashboard</Eyebrow>
        <h1 className="mt-2 font-display text-3xl text-fg sm:text-4xl">Leads</h1>
        <p className="mt-2 text-sm text-fg-muted">Signed in as {agent.email}</p>
      </div>
      <EmptyState title="No leads yet" body="Viewing requests from the assistant will appear here." />
    </div>
  );
}
