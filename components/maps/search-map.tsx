"use client";

import { MapPinOff } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { MapPoint } from "@/lib/server/public-search";
import { MapBoundary } from "./map-boundary";

// The search Map view (spec 0011). The canvas, and MapLibre with it, loads only
// here (AC-8); without a key, or when the map fails, a message links to the grid (AC-9).

const Canvas = dynamic(() => import("./search-map-canvas"), { ssr: false, loading: () => <Skeleton className="h-full w-full rounded-none" /> });

type Props = {
  apiKey: string | null;
  points: MapPoint[];
  total: number;
  listHref: string;
  gridHref: string;
};

export function SearchMap({ apiKey, points, total, listHref, gridHref }: Props) {
  const [failed, setFailed] = useState(false);
  const shown = points.length;
  const label = `Map of ${shown.toLocaleString("en-US")} ${shown === 1 ? "home" : "homes"} matching your search`;
  const unavailable = (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-surface-sunken p-6 text-center">
      <MapPinOff aria-hidden="true" className="h-8 w-8 text-fg-subtle" />
      <p className="font-medium text-fg">The map isn&apos;t available right now</p>
      <Link href={gridHref} className="text-sm text-accent hover:underline">
        Show the homes as a grid
      </Link>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* AC-10: the List view is the keyboard and screen reader equivalent. */}
      <Link href={listHref} className="self-start rounded text-sm text-accent underline-offset-4 hover:underline">
        Skip the map, show as a list
      </Link>
      {total > shown ? (
        <p className="text-sm text-fg-muted">
          Showing the newest {shown.toLocaleString("en-US")} of {total.toLocaleString("en-US")}
        </p>
      ) : null}
      <div className="relative h-[70vh] min-h-[420px] overflow-hidden rounded-2xl border border-line">
        {!apiKey || failed ? (
          unavailable
        ) : (
          <MapBoundary fallback={unavailable}>
            <Canvas apiKey={apiKey} points={points} label={label} onFail={() => setFailed(true)} />
          </MapBoundary>
        )}
        {apiKey && !failed && shown === 0 ? (
          <p className="pointer-events-none absolute inset-x-0 top-4 mx-auto w-fit rounded-full bg-surface-raised px-4 py-2 text-sm font-medium text-fg shadow-soft">
            No homes match these filters
          </p>
        ) : null}
      </div>
    </div>
  );
}
