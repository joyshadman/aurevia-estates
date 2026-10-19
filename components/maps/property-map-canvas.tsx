"use client";

import { Map as MapLibre, Marker, NavigationControl } from "maplibre-gl";
import { useEffect, useRef } from "react";
import { mapStyle, pinColor } from "@/lib/maps";
import { styleTimeoutMs } from "./load-maplibre";

// The property page's live map (spec 0011, AC-4), loaded only after "Show
// interactive map" (AC-8). Errors before the first load mean it's down (AC-9).
export default function PropertyMapCanvas({ apiKey, lat, lng, label, onFail }: { apiKey: string; lat: number; lng: number; label: string; onFail: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  const failRef = useRef(onFail);
  useEffect(() => {
    failRef.current = onFail;
  });

  useEffect(() => {
    if (!container.current) return;
    const instance = new MapLibre({
      container: container.current,
      style: mapStyle(apiKey) as never,
      center: [lng, lat],
      zoom: 15,
      attributionControl: { compact: true },
      locale: { "Map.Title": label },
    });
    instance.addControl(new NavigationControl({ showCompass: false }), "top-right");
    new Marker({ color: pinColor }).setLngLat([lng, lat]).addTo(instance);
    let loaded = false;
    const timeout = window.setTimeout(() => {
      if (!loaded) failRef.current();
    }, styleTimeoutMs);
    instance.on("error", () => {
      if (!loaded) failRef.current();
    });
    instance.on("load", () => {
      loaded = true;
      window.clearTimeout(timeout);
    });
    return () => {
      window.clearTimeout(timeout);
      instance.remove();
    };
  }, [apiKey, lat, lng, label]);

  return <div ref={container} className="h-full w-full" />;
}
