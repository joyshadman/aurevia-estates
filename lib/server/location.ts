import "server-only";
import { insideBangladesh, roundCoordinate } from "@/lib/domain/geo";

// Turns pasted coordinates or a Google Maps link into a point (spec 0005,
// "Location parsing", AC-7). Short links are followed by hand: https only, exact
// Google hosts on every hop, at most 5 hops, 3 seconds in total, no cookies.

export type LocationReason = "location_unreadable" | "outside_bangladesh";
export type LocationResult = { ok: true; latitude: number; longitude: number } | { ok: false; reason: LocationReason };

const mapsHosts = new Set(["google.com", "www.google.com", "maps.google.com"]);
const hopHosts = new Set(["maps.app.goo.gl", "goo.gl", ...mapsHosts]);
const maxHops = 5;
const timeoutMs = 3000;

const number = String.raw`(-?\d{1,3}(?:\.\d+)?)`;
const plainPair = new RegExp(String.raw`^\s*${number}\s*,\s*${number}\s*$`);

function pair(text: string | null | undefined): [number, number] | null {
  const match = text ? plainPair.exec(text) : null;
  return match ? [Number(match[1]), Number(match[2])] : null;
}

function toUrl(input: string): URL | null {
  const text = input.trim();
  try {
    // Agents often paste a link without the scheme ("maps.app.goo.gl/...").
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
}

const isShortLink = (url: URL) =>
  url.hostname === "maps.app.goo.gl" || (url.hostname === "goo.gl" && url.pathname.startsWith("/maps"));

// Step 2: a full Google Maps URL.
function fromMapsUrl(url: URL): [number, number] | null {
  if (!mapsHosts.has(url.hostname) || !url.pathname.startsWith("/maps")) return null;
  const href = decodeURIComponent(url.href);
  const pin = new RegExp(String.raw`!3d${number}!4d${number}`).exec(href);
  if (pin) return [Number(pin[1]), Number(pin[2])];
  const view = new RegExp(String.raw`@${number},${number}`).exec(href);
  if (view) return [Number(view[1]), Number(view[2])];
  for (const key of ["q", "query", "ll"]) {
    const found = pair(url.searchParams.get(key));
    if (found) return found;
  }
  return null;
}

// Step 3: follow a short link to the full URL.
async function expandShortLink(start: URL, doFetch: typeof fetch): Promise<URL | null> {
  const signal = AbortSignal.timeout(timeoutMs);
  let current = start;
  try {
    for (let hop = 0; hop <= maxHops; hop++) {
      if (current.protocol !== "https:" || !hopHosts.has(current.hostname)) return null;
      const response = await doFetch(current.href, {
        method: "GET",
        redirect: "manual",
        credentials: "omit",
        cache: "no-store",
        signal,
      });
      await response.body?.cancel();
      if (response.status < 300 || response.status >= 400) return current;
      const location = response.headers.get("location");
      if (!location || hop === maxHops) return null;
      current = new URL(location, current);
    }
  } catch {
    // Timeout or network error.
  }
  return null;
}

export async function resolveLocation(input: string, options: { fetch?: typeof fetch } = {}): Promise<LocationResult> {
  let point = pair(input);
  if (!point) {
    const url = toUrl(input);
    if (url) {
      const full = isShortLink(url) ? await expandShortLink(url, options.fetch ?? fetch) : url;
      point = full ? fromMapsUrl(full) : null;
    }
  }
  if (!point) return { ok: false, reason: "location_unreadable" };

  // Step 4.
  const [latitude, longitude] = point.map(roundCoordinate) as [number, number];
  if (!insideBangladesh(latitude, longitude)) return { ok: false, reason: "outside_bangladesh" };
  return { ok: true, latitude, longitude };
}
