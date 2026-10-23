// Listing coordinates (spec 0005, AC-7). Pure, so the form, `resolveLocation`,
// and every save share the same bounds and rounding.

export const bangladeshBounds = { minLat: 20.5, maxLat: 26.7, minLng: 88.0, maxLng: 92.7 } as const;

export function roundCoordinate(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

export function inBangladesh(latitude: number, longitude: number): boolean {
  return (
    latitude >= bangladeshBounds.minLat &&
    latitude <= bangladeshBounds.maxLat &&
    longitude >= bangladeshBounds.minLng &&
    longitude <= bangladeshBounds.maxLng
  );
}

// Plain coordinates: two decimal numbers separated by a comma and optional spaces.
const coordinatePair = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

export function parseCoordinatePair(text: string): { latitude: number; longitude: number } | null {
  const match = coordinatePair.exec(text);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

// The "Open in Google Maps" check link on the form.
export function googleMapsLink(latitude: number, longitude: number): string {
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}
