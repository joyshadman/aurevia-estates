"use client";

import { Check, CircleDashed } from "lucide-react";
import { PropertyCard } from "@/components/listing/property-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { MatchCard } from "@/lib/domain/match-score";
import type { ChatCard } from "@/lib/server/conversations";

// Up to three result cards (spec 0006, AC-4, AC-5, AC-18). The match facts come
// from the saved result; photo, price, and chips come from the database on every
// load, so a card never shows a stale or withdrawn home as available.
export function MatchCards({
  cards,
  data,
  onAsk,
  disabled,
}: {
  cards: MatchCard[];
  data: Record<string, ChatCard>;
  onAsk: (refCode: string) => void;
  disabled: boolean;
}) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => {
        const current = data[card.listingId];
        if (!current) {
          return (
            <li key={card.listingId}>
              <Skeleton className="h-80 rounded-2xl" />
            </li>
          );
        }
        if (!current.available) {
          return (
            <li key={card.listingId} className="flex flex-col gap-1 rounded-2xl border border-line bg-surface-raised p-5">
              <span className="text-sm font-medium text-fg">{current.title}</span>
              <span className="text-xs text-fg-subtle">{card.refCode}</span>
              <Badge className="mt-2 self-start">No longer available</Badge>
            </li>
          );
        }
        const badge =
          card.exact && card.matchPercent !== null ? (
            <Badge tone="success">{card.matchPercent}% match</Badge>
          ) : !card.exact ? (
            <Badge tone="warning">{card.matchPercent !== null ? `${card.matchPercent}% · Close, but` : "Close, but"}</Badge>
          ) : null;
        return (
          <li key={card.listingId}>
            <PropertyCard
              listing={current.listing}
              badge={badge}
              footer={
                <div className="flex flex-col gap-3">
                  {card.why.length > 0 ? (
                    <ul className="flex flex-col gap-1 text-xs text-fg-muted">
                      {card.why.slice(0, 3).map((line) => (
                        <li key={line} className="flex items-start gap-1.5">
                          <Check aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                          {line}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {card.differs.length > 0 ? (
                    <ul className="flex flex-col gap-1 text-xs text-warning-subtle-fg">
                      {card.differs.map((line) => (
                        <li key={line} className="flex items-start gap-1.5">
                          <CircleDashed aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>
                            <span className="sr-only">Differs: </span>
                            {line}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <Button size="sm" intent="secondary" onClick={() => onAsk(card.refCode)} disabled={disabled}>
                    Ask about this home
                  </Button>
                </div>
              }
            />
          </li>
        );
      })}
    </ul>
  );
}
