"use client";

import { CalendarDays } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/state";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/nav";
import type { ViewingCard } from "@/lib/server/viewing-cards";
import { ViewingActions, ViewingStateBadge, ViewingTime } from "@/app/assistant/viewing-parts";

// "Your viewings" on `/account` (spec 0007, AC-11): upcoming ones with Change
// time and Cancel, then the 5 latest others.
export function YourViewings({ upcoming, recent }: { upcoming: ViewingCard[]; recent: ViewingCard[] }) {
  const router = useRouter();

  if (upcoming.length === 0 && recent.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="No viewings yet"
        body="Tell the assistant which home you'd like to see, and it will show you times to book."
        action={
          <Button href={routes.assistant} intent="secondary" size="sm">
            Open the assistant
          </Button>
        }
        className="py-10"
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {upcoming.length > 0 ? (
        <ViewingList title="Upcoming" rows={upcoming} onChanged={() => router.refresh()} />
      ) : (
        <p className="text-sm text-fg-muted">No upcoming viewings.</p>
      )}
      {recent.length > 0 ? <ViewingList title="Recent" rows={recent} onChanged={() => router.refresh()} /> : null}
    </div>
  );
}

function ViewingList({ title, rows, onChanged }: { title: string; rows: ViewingCard[]; onChanged: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium text-fg-muted">{title}</h3>
      <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line">
        {rows.map((row) => {
          const active = row.state === "REQUESTED" || row.state === "CONFIRMED" || row.state === "AWAITING_UPDATE";
          const rescheduled = row.rescheduledIds.includes(row.viewingId);
          return (
            <li key={row.viewingId} className="flex flex-col gap-3 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <p className="font-medium text-fg">{row.title}</p>
                  <p className="text-sm text-fg-subtle">{row.refCode}</p>
                </div>
                {rescheduled ? <Badge>Rescheduled</Badge> : <ViewingStateBadge state={row.state} />}
              </div>
              <ViewingTime start={row.start} className="text-sm" />
              <p className="text-sm text-fg-muted">Advisor: {row.advisorName}</p>
              {active && !row.listingAvailable ? (
                <p className="text-sm font-medium text-warning-subtle-fg">This home is no longer available.</p>
              ) : null}
              <ViewingActions viewing={{ ...row, active }} onChanged={onChanged} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
