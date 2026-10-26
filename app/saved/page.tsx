import { Heart, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PropertyCard } from "@/components/listing/property-card";
import { Button } from "@/components/ui/button";
import { Container, Eyebrow } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/state";
import { discoveryPath } from "@/lib/domain/discovery";
import { routes } from "@/lib/nav";
import { requireUser } from "@/lib/server/auth";
import { listSavedHomes } from "@/lib/server/saved-homes";
import { ListingCardLink, listingHref } from "../properties/listing-href";
import { SaveHomeButton } from "./save-home";

export const metadata: Metadata = { title: "Saved homes", robots: { index: false } };

const path = "/saved";

// `/saved` (spec 0014, AC-3): the signed in user's hearts, newest first.
export default function SavedPage() {
  return (
    <Container className="py-12">
      <Eyebrow>Your account</Eyebrow>
      <h1 className="mt-2 font-display text-4xl text-fg sm:text-5xl">Saved homes</h1>
      <p className="mt-3 max-w-xl text-fg-muted">Homes you&apos;ve hearted, newest first. Tap a heart again to remove a home.</p>
      <Suspense fallback={<Skeleton className="mt-10 h-96 w-full" />}>
        <SavedList />
      </Suspense>
    </Container>
  );
}

async function SavedList() {
  const user = await requireUser({ next: path });
  const homes = await listSavedHomes(user);

  if (homes.length === 0) {
    return (
      <EmptyState
        className="mt-10"
        icon={Heart}
        title="No saved homes yet"
        body="Tap the heart on any home to keep it here, ready to compare or share."
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Button href={discoveryPath}>Browse homes</Button>
            <Button href={routes.assistant} intent="secondary">
              <Sparkles aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
              Ask the assistant
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {homes.map(({ card, available }) =>
        available ? (
          <li key={card.slug}>
            <PropertyCard
              listing={card}
              href={listingHref(card.slug)}
              className="h-full"
              save={<SaveHomeButton slug={card.slug} />}
              footer={<ListingCardLink listing={card} />}
            />
          </li>
        ) : (
          <li key={card.slug} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface-raised p-6">
            <p className="font-medium text-fg">{card.title}</p>
            <p className="text-sm text-fg-muted">
              {card.areaName} · {card.refCode}
            </p>
            <p className="text-sm text-fg-muted">No longer available. It may have sold or been taken off the market.</p>
            <SaveHomeButton slug={card.slug} variant="button" className="self-start" />
          </li>
        ),
      )}
    </ul>
  );
}
