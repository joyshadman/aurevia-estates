import "server-only";
import { inBangladesh, parseCoordinatePair, roundCoordinate } from "@/lib/domain/location";

// Location parsing for the listing form (spec 0005, AC-7, *Location parsing*).
// Short links are followed by hand: only exact Google hosts, https on every
// hop, no cookies, at most 5 hops, 3 seconds in total.

export type LocationResult =
  | { ok: true; latitude: number; longitude: number }
  | { ok: false; reason: "location_unreadable" | "outside_bangladesh" };

const mapsHosts = new Set(["google.com", "www.google.com", "maps.google.com"]);
const shortHosts = new Set(["maps.app.goo.gl", "goo.gl"]);
const maxHops = 5;
const timeoutMs = 3000;

const number = String.raw`(-?\d{1,3}(?:\.\d+)?)`;
const dataPin = new RegExp(String.raw`!3d${number}!4d${number}`);
const atPin = new RegExp(String.raw`@${number},${number}`);

function fromMapsUrl(url: URL): { latitude: number; longitude: number } | null {
  if (url.protocol !== "https:" || !mapsHosts.has(url.hostname) || !url.pathname.startsWith("/maps")) return null;
  const text = decodeURIComponent(url.pathname + url.search);
  for (const pattern of [dataPin, atPin]) {
    const match = pattern.exec(text);
    if (match) return { latitude: Number(match[1]), longitude: Number(match[2]) };
  }
  for (const key of ["q", "query", "ll"]) {
    const value = url.searchParams.get(key);
    const pair = value ? parseCoordinatePair(value) : null;
    if (pair) return pair;
  }
  return null;
}

const isShortLink = (url: URL) =>
  url.protocol === "https:" &&
  (url.hostname === "maps.app.goo.gl" || (url.hostname === "goo.gl" && url.pathname.startsWith("/maps")));

async function followShortLink(start: URL): Promise<URL | null> {
  const signal = AbortSignal.timeout(timeoutMs);
  let current = start;
  for (let hop = 0; hop <= maxHops; hop++) {
    const response = await fetch(current, { method: "GET", redirect: "manual", signal, credentials: "omit" });
    await response.body?.cancel();
    if (response.status < 300 || response.status >= 400) return current;
    const location = response.headers.get("location");
    if (!location || hop === maxHops) return null;
    const next = new URL(location, current);
    // Google's consent page (some server regions) has no coordinates: give up.
    if (next.protocol !== "https:" || !(mapsHosts.has(next.hostname) || shortHosts.has(next.hostname))) return null;
    current = next;
  }
  return null;
}

export async function resolveLocation(input: string): Promise<LocationResult> {
  const text = input.trim().slice(0, 2000);
  let pair = parseCoordinatePair(text);

  if (!pair) {
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      return { ok: false, reason: "location_unreadable" };
    }
    if (isShortLink(url)) {
      try {
        const final = await followShortLink(url);
        pair = final ? fromMapsUrl(final) : null;
      } catch {
        pair = null;
      }
    } else {
      pair = fromMapsUrl(url);
    }
  }

  if (!pair) return { ok: false, reason: "location_unreadable" };
  const latitude = roundCoordinate(pair.latitude);
  const longitude = roundCoordinate(pair.longitude);
  if (!inBangladesh(latitude, longitude)) return { ok: false, reason: "outside_bangladesh" };
  return { ok: true, latitude, longitude };
}
