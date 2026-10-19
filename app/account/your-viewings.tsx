"use client";

import { useRouter } from "next/navigation";
import { ViewingCardView } from "@/components/assistant/viewing-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/state";
import type { ViewingCard } from "@/lib/server/viewing-bookings";

// "Your viewings" (spec 0007, AC-11): upcoming first, soonest first; then the
// five most recent others. Changes here show on the chat's cards too (AC-8).
export function YourViewings({ initial }: { initial: { upcoming: ViewingCard[]; recent: ViewingCard[] } }) {
  const router = useRouter();
  const refresh = () => router.refresh();

  return (
    <section aria-labelledby="your-viewings" className="flex flex-col gap-4">
      <h2 id="your-viewings" className="font-display text-2xl text-fg">
        Your viewings
      </h2>
      {initial.upcoming.length === 0 && initial.recent.length === 0 ? (
        <EmptyState
          title="No viewings yet"
          body="Ask the assistant to find homes, then book a viewing from a result."
          action={<Button href="/assistant">Open the assistant</Button>}
        />
      ) : null}
      {initial.upcoming.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium text-fg-muted">Upcoming</h3>
          {initial.upcoming.map((card) => (
            <ViewingCardView key={card.viewingId} card={card} onChanged={refresh} />
          ))}
        </div>
      ) : null}
      {initial.recent.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-medium text-fg-muted">Recent</h3>
          {initial.recent.map((card) => (
            <ViewingCardView key={card.viewingId} card={card} onChanged={refresh} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
