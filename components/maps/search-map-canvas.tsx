"use client";

import { X } from "lucide-react";
import { LngLatBounds, Map as MapLibre, Marker, NavigationControl, type GeoJSONSource, type MapLayerMouseEvent } from "maplibre-gl";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ListingImage } from "@/components/listing/listing-image";
import { PriceTag } from "@/components/listing/price-tag";
import { SpecChips } from "@/components/listing/spec-chips";
import { formatPrice } from "@/lib/format";
import { mapStyle, pinColor, pinTextColor, shortPrice, sylhet } from "@/lib/maps";
import type { MapPoint } from "@/lib/server/public-search";
import { prefersReducedMotion, styleTimeoutMs } from "./load-maplibre";

// The search Map view's canvas (spec 0011, AC-1 to AC-3). Loaded lazily by
// `SearchMap`; everything MapLibre lives in this chunk.
//
// Clusters are a circle layer; single homes are HTML pins. Map glyph fonts lack
// the taka sign (it sits in the Bengali block), and HTML pins render it in the
// site's own font, take role color tokens, and are real buttons (AC-2).

const sourceId = "homes";
const pinClass =
  "map-pin min-h-6 cursor-pointer rounded-full border-2 border-surface-raised bg-accent px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-on-accent shadow-soft transition-transform duration-fast hover:scale-105 aria-pressed:bg-accent-hover";

function toGeoJSON(points: MapPoint[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: points.map((p) => ({ type: "Feature", geometry: { type: "Point", coordinates: [p.lng, p.lat] }, properties: { id: p.id } })),
  };
}

// `label` names the canvas, MapLibre's own region (AC-10).
export default function SearchMapCanvas({ apiKey, points, label, onFail }: { apiKey: string; points: MapPoint[]; label: string; onFail: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const failRef = useRef(onFail);
  const byId = useMemo(() => new Map(points.map((p) => [p.id, p])), [points]);
  const byIdRef = useRef(byId);
  useEffect(() => {
    failRef.current = onFail;
    byIdRef.current = byId;
  });
  // AC-3: reframe only when the set of homes changes, not on every render.
  const setKey = useMemo(() => points.map((p) => p.id).sort().join(","), [points]);

  useEffect(() => {
    if (!container.current) return;
    const instance = new MapLibre({
      container: container.current,
      style: mapStyle(apiKey) as never,
      center: [sylhet.lng, sylhet.lat],
      zoom: sylhet.zoom,
      attributionControl: { compact: true },
      locale: { "Map.Title": label },
    });
    map.current = instance;
    const pins = markers.current;
    instance.addControl(new NavigationControl({ showCompass: false }), "top-right");

    // AC-9: an error before the map has loaded (the style, the TileJSON, or a
    // bad or restricted key), or no load after 8 s, means the map is down. A
    // stray tile or glyph error after that leaves a working map in place.
    let loaded = false;
    const timeout = window.setTimeout(() => {
      if (!loaded) failRef.current();
    }, styleTimeoutMs);
    instance.on("error", () => {
      if (!loaded) failRef.current();
    });

    // One HTML pin per home MapLibre has not clustered at this zoom.
    function syncPins() {
      const shown = new Set<string>();
      for (const feature of instance.querySourceFeatures(sourceId)) {
        if (feature.properties.cluster) continue;
        const id = feature.properties.id as string;
        const home = byIdRef.current.get(id);
        if (!home || shown.has(id)) continue;
        shown.add(id);
        if (pins.has(id)) continue;
        const button = document.createElement("button");
        button.type = "button";
        button.className = pinClass;
        button.textContent = shortPrice(home.priceBdt);
        button.setAttribute("aria-label", `${home.title}, ${formatPrice(home.priceBdt)}`);
        button.setAttribute("aria-pressed", "false");
        button.addEventListener("click", () => setSelected(id));
        // MapLibre positions the wrapper with `transform`; the button's own
        // hover scale must not fight it.
        const wrapper = document.createElement("div");
        wrapper.append(button);
        pins.set(id, new Marker({ element: wrapper }).setLngLat([home.lng, home.lat]).addTo(instance));
      }
      for (const [id, marker] of pins) {
        if (!shown.has(id)) {
          marker.remove();
          pins.delete(id);
        }
      }
    }

    instance.on("load", () => {
      loaded = true;
      window.clearTimeout(timeout);
      instance.addSource(sourceId, { type: "geojson", data: { type: "FeatureCollection", features: [] }, cluster: true, clusterRadius: 50, clusterMaxZoom: 14 });
      instance.addLayer({
        id: "clusters",
        type: "circle",
        source: sourceId,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": pinColor,
          "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 50, 26],
          "circle-stroke-color": pinTextColor,
          "circle-stroke-width": 2,
        },
      });
      instance.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: sourceId,
        filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Bold"], "text-size": 13, "text-allow-overlap": true },
        paint: { "text-color": pinTextColor },
      });

      instance.on("click", "clusters", async (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        if (!feature) return;
        setSelected(null);
        const zoom = await instance.getSource<GeoJSONSource>(sourceId)?.getClusterExpansionZoom(feature.properties.cluster_id as number);
        if (zoom === undefined) return;
        const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
        instance.easeTo({ center: [lng, lat], zoom, duration: prefersReducedMotion() ? 0 : 400 });
      });
      // Selecting the map (not a pin or a cluster) closes the card (AC-2).
      instance.on("click", (e) => {
        if ((e.originalEvent.target as Element | null)?.closest(".map-pin")) return;
        if (instance.queryRenderedFeatures(e.point, { layers: ["clusters"] }).length === 0) setSelected(null);
      });
      instance.on("mouseenter", "clusters", () => (instance.getCanvas().style.cursor = "pointer"));
      instance.on("mouseleave", "clusters", () => (instance.getCanvas().style.cursor = ""));
      instance.on("render", () => {
        if (instance.getSource(sourceId) && instance.isSourceLoaded(sourceId)) syncPins();
      });
      setReady(true);
    });

    return () => {
      window.clearTimeout(timeout);
      for (const marker of pins.values()) marker.remove();
      pins.clear();
      instance.remove();
      map.current = null;
    };
    // The label is kept current by its own effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  useEffect(() => {
    map.current?.getCanvas().setAttribute("aria-label", label);
  }, [label]);

  // New homes: replace the data and frame them (AC-3).
  useEffect(() => {
    const instance = map.current;
    if (!ready || !instance) return;
    for (const marker of markers.current.values()) marker.remove();
    markers.current.clear();
    instance.getSource<GeoJSONSource>(sourceId)?.setData(toGeoJSON(points));
    setSelected(null);
    const duration = prefersReducedMotion() ? 0 : 600;
    if (points.length === 0) {
      instance.easeTo({ center: [sylhet.lng, sylhet.lat], zoom: sylhet.zoom, duration });
    } else if (points.length === 1) {
      instance.easeTo({ center: [points[0].lng, points[0].lat], zoom: 15, duration });
    } else {
      const bounds = new LngLatBounds();
      for (const p of points) bounds.extend([p.lng, p.lat]);
      instance.fitBounds(bounds, { padding: 48, maxZoom: 15, duration });
    }
    // `points` changes with `setKey`; framing follows the set, not the array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, setKey]);

  // The open pin shows as pressed; Escape closes the card (AC-2).
  useEffect(() => {
    for (const [id, marker] of markers.current) marker.getElement().firstElementChild?.setAttribute("aria-pressed", String(id === selected));
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelected(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected]);

  const home = selected ? byId.get(selected) : undefined;

  return (
    <div className="relative h-full w-full">
      <div ref={container} className="h-full w-full" />
      {home ? (
        <article className="absolute inset-x-3 bottom-3 z-10 flex gap-3 rounded-2xl border border-line bg-surface-raised p-3 shadow-lift sm:inset-x-auto sm:left-3 sm:w-[380px]">
          <ListingImage src={home.cover?.url ?? null} alt={home.cover?.alt ?? home.title} className="h-[120px] w-[160px] shrink-0 rounded-xl" />
          <div className="flex min-w-0 flex-1 flex-col gap-1 pr-6">
            <PriceTag priceBdt={home.priceBdt} negotiable={false} />
            <h3 className="truncate text-sm font-medium text-fg">
              <Link href={`/properties/${home.slug}`} className="hover:text-accent">
                {home.title}
              </Link>
            </h3>
            <p className="text-xs text-fg-muted">{home.areaName}</p>
            <SpecChips listing={home} className="mt-auto" />
          </div>
          <button type="button" aria-label="Close" onClick={() => setSelected(null)} className="absolute top-2 right-2 grid h-7 w-7 place-items-center rounded-full bg-surface-raised text-fg-muted hover:text-fg">
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </article>
      ) : null}
    </div>
  );
}
