"use client";

import { Map as MapIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { staticMapUrl } from "@/lib/maps";
import { MapBoundary } from "./map-boundary";

// The property page map (spec 0011, AC-4): a static image of the pin, and a live
// map only after "Show interactive map" (AC-8). Without a key, or when both
// fail, nothing shows; the address and the Google Maps link stay (AC-9).

const Canvas = dynamic(() => import("./property-map-canvas"), { ssr: false, loading: () => <Skeleton className="h-full w-full rounded-none" /> });

type Props = { apiKey: string | null; lat: number; lng: number; title: string; areaName: string };

export function PropertyMap({ apiKey, lat, lng, title, areaName }: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  const [live, setLive] = useState(false);
  const [liveFailed, setLiveFailed] = useState(false);
  const image = useRef<HTMLImageElement>(null);
  const label = `Map showing ${title} in ${areaName}`;

  // An image that failed before hydration never fires React's onError.
  useEffect(() => {
    const el = image.current;
    if (el?.complete && el.naturalWidth === 0) setImageFailed(true);
  }, []);

  if (!apiKey) return null;
  const showLive = live && !liveFailed;
  if (!showLive && imageFailed) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative aspect-[16/9] overflow-hidden rounded-2xl border border-line bg-surface-sunken">
        {showLive ? (
          <MapBoundary fallback={null}>
            <Canvas apiKey={apiKey} lat={lat} lng={lng} label={label} onFail={() => setLiveFailed(true)} />
          </MapBoundary>
        ) : (
          // A plain image (spec 0011, AC-4): MapTiler serves it sized and scaled already.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={image}
            src={staticMapUrl(apiKey, lat, lng)}
            alt={label}
            width={640}
            height={360}
            loading="lazy"
            onError={() => setImageFailed(true)}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      {!live ? (
        <Button intent="secondary" size="sm" className="self-start" onClick={() => setLive(true)}>
          <MapIcon aria-hidden="true" className="h-4 w-4" />
          Show interactive map
        </Button>
      ) : null}
    </div>
  );
}
