import baseStyle from "@/lib/maps/style.json";

// Map helpers shared by the server and the browser (spec 0011). No MapLibre
// import here: the library loads only inside `components/maps/` on demand.

// Burgundy 600 (spec 0003); pins and clusters only (AC-12).
export const pinColor = "#853953";
export const pinTextColor = "#ffffff";

// Sylhet city, for an empty search map (AC-3).
export const sylhet = { lat: 24.8949, lng: 91.8687, zoom: 12 } as const;

// MapTiler's static maps draw the same base as the interactive style.
const staticMapId = "dataviz";

// The committed brand style with MapTiler's tiles and glyphs filled in (AC-12).
export function mapStyle(key: string) {
  const k = encodeURIComponent(key);
  return {
    ...baseStyle,
    sources: { openmaptiles: { type: "vector" as const, url: `https://api.maptiler.com/tiles/v3/tiles.json?key=${k}` } },
    glyphs: `https://api.maptiler.com/fonts/{fontstack}/{range}.pbf?key=${k}`,
  };
}

// AC-4: 640×360 shown, at 2× scale, zoom 15, one burgundy marker.
export function staticMapUrl(key: string, lat: number, lng: number) {
  const marker = `${lng},${lat},${pinColor}`;
  return `https://api.maptiler.com/maps/${staticMapId}/static/${lng},${lat},15/640x360@2x.png?key=${encodeURIComponent(key)}&markers=${encodeURIComponent(marker)}`;
}

// Short price on pins: whole lakh below 1 crore, else crore to one decimal
// with ".0" dropped. Rounding first, so 99.5 lakh is "৳ 1 Cr".
export function shortPrice(bdt: number): string {
  const lakh = Math.round(bdt / 100_000);
  if (lakh < 100) return `৳ ${lakh} L`;
  const crore = Math.round(bdt / 1_000_000) / 10;
  return `৳ ${Number.isInteger(crore) ? crore.toFixed(0) : crore.toFixed(1)} Cr`;
}

// ---------------------------------------------------------------------------
// Nearby places (AC-5, AC-6).

export const placeKinds = ["SCHOOL", "HEALTH", "MOSQUE", "MARKET", "SHOPPING", "PARK", "TRANSPORT", "LANDMARK", "OTHER"] as const;
export type PlaceKind = (typeof placeKinds)[number];

export const placeKindLabels: Record<PlaceKind, string> = {
  SCHOOL: "School",
  HEALTH: "Hospital or clinic",
  MOSQUE: "Mosque",
  MARKET: "Market",
  SHOPPING: "Shopping",
  PARK: "Park",
  TRANSPORT: "Transport",
  LANDMARK: "Landmark",
  OTHER: "Other",
};

export const travelModes = ["WALK", "DRIVE"] as const;
export type TravelMode = (typeof travelModes)[number];

export const maxNearbyPlaces = 8;

export type NearbyPlace = { name: string; kind: PlaceKind; minutes: number; mode: TravelMode };

export function travelText(place: Pick<NearbyPlace, "minutes" | "mode">): string {
  return `${place.minutes} min ${place.mode === "WALK" ? "walk" : "drive"}`;
}
