"use client";

import { Heart, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { PropertyCard } from "@/components/listing/property-card";
import { useSavedHomes } from "@/components/listing/saved-store";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/state";
import type { SavedItem } from "@/lib/server/saved-homes";
import { loadMoreSavedAction } from "./actions";

// Available homes stay as cards when unhearted, so a slip can be undone; homes no
// longer available are short rows that leave once removed (spec 0013).
export function SavedList(props: { items: SavedItem[]; nextCursor: string | null }) {
  const [items, setItems] = useState(props.items);
  const [cursor, setCursor] = useState(props.nextCursor);
  const [failed, setFailed] = useState(false);
  const [loading, startLoading] = useTransition();
  const store = useSavedHomes();

  const visible = items.filter((item) => item.available || store.status !== "ready" || store.ids.has(item.listingId));

  if (visible.length === 0 && !cursor) {
    return (
      <EmptyState
        icon={Heart}
        title="No saved homes yet"
        body="Tap the heart on any home to keep it here."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button href="/properties" intent="secondary">
              Browse homes
            </Button>
            <Button href="/assistant">
              <Sparkles aria-hidden="true" className="h-4 w-4" />
              Ask the assistant
            </Button>
          </div>
        }
      />
    );
  }

  function loadMore() {
    if (!cursor) return;
    setFailed(false);
    startLoading(async () => {
      try {
        const next = await loadMoreSavedAction(cursor);
        setItems((current) => [...current, ...next.items]);
        setCursor(next.nextCursor);
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <ul className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((item) =>
          item.available ? (
            <li key={item.listingId}>
              <PropertyCard listing={item.card} href={`/properties/${item.card.slug}`} pricePerSqft={item.card.pricePerSqft} saveable />
            </li>
          ) : (
            <li key={item.listingId} className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-line-strong p-5 sm:col-span-2 xl:col-span-3">
              <p className="text-sm text-fg-muted">
                <span className="text-fg">{item.title}</span> · No longer available
              </p>
              <Button
                intent="ghost"
                size="sm"
                aria-label={`Remove ${item.title}`}
                loading={store.pending.has(item.listingId)}
                onClick={() => store.toggle(item.listingId)}
              >
                Remove
              </Button>
            </li>
          ),
        )}
      </ul>
      {failed ? (
        <p role="alert" className="text-center text-sm text-danger">
          Couldn&apos;t load more homes.{" "}
          <button type="button" onClick={loadMore} className="underline">
            Try again
          </button>
        </p>
      ) : null}
      {cursor ? (
        <Button intent="secondary" className="self-center" onClick={loadMore} loading={loading}>
          Show more homes
        </Button>
      ) : null}
    </div>
  );
}
