import type { Metadata } from "next";
import { Suspense } from "react";
import { Container } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/server/auth";
import { listSaved } from "@/lib/server/saved-homes";
import { SavedList } from "./saved-list";

export const metadata: Metadata = { title: "Saved homes", robots: { index: false } };

// The saved homes list (spec 0013): signed in only, newest saved first.
export default function SavedPage() {
  return (
    <Container className="flex flex-col gap-8 py-10">
      <div>
        <h1 className="font-display text-4xl text-fg">Saved homes</h1>
        <p className="mt-2 text-fg-muted">Homes you&apos;ve hearted, newest first.</p>
      </div>
      <Suspense fallback={<SavedSkeleton />}>
        <Saved />
      </Suspense>
    </Container>
  );
}

async function Saved() {
  const user = await requireUser({ next: "/saved" });
  const first = await listSaved(user);
  return <SavedList items={first.items} nextCursor={first.nextCursor} />;
}

function SavedSkeleton() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-80 rounded-2xl" />
      ))}
    </div>
  );
}
