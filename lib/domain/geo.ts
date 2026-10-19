// Bangladesh bounds for listing coordinates (spec 0005, AC-7). Checked when a
// location is resolved and again on every save.
export const bangladeshBounds = { minLat: 20.5, maxLat: 26.7, minLng: 88.0, maxLng: 92.7 } as const;

export function roundCoordinate(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

export function insideBangladesh(lat: number, lng: number): boolean {
  const b = bangladeshBounds;
  return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
}

export function googleMapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
