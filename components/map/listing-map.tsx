"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import type { MapMarker } from "./leaflet-map";

export type { MapMarker };

const LeafletMap = dynamic(() => import("./leaflet-map"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
});

// The map frame (spec 0013). `label` names the map for screen readers; the
// pins are also listed as links beside it, so nothing depends on the map.
export function ListingMap({
  markers,
  label,
  zoom,
  className,
}: {
  markers: MapMarker[];
  label: string;
  zoom?: number;
  className?: string;
}) {
  return (
    <div role="region" aria-label={label} className={cn("relative isolate overflow-hidden rounded-2xl border border-line bg-surface-sunken", className)}>
      <LeafletMap markers={markers} zoom={zoom} className="h-full w-full" />
    </div>
  );
}
