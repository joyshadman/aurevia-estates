"use client";

import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { FavoriteButton } from "@/components/listing/favorite-button";
import { useSavedHomes } from "@/components/listing/saved-store";

// The live heart (spec 0013): filled from the shared store after hydration.
export function SaveHeart({ listingId, className }: { listingId: string; className?: string }) {
  const { ids, pending, toggle } = useSavedHomes();
  return (
    <FavoriteButton
      pressed={ids.has(listingId)}
      pending={pending.has(listingId)}
      onToggle={() => toggle(listingId)}
      className={className}
    />
  );
}

// The property page's labelled version, beside Share (spec 0013).
export function SaveButton({ listingId }: { listingId: string }) {
  const { ids, pending, toggle } = useSavedHomes();
  const saved = ids.has(listingId);
  return (
    <Button intent="secondary" size="sm" aria-busy={pending.has(listingId) || undefined} onClick={() => toggle(listingId)}>
      <Heart aria-hidden="true" className={cn("h-4 w-4 text-accent", saved && "fill-current")} />
      {saved ? "Saved" : "Save"}
    </Button>
  );
}
