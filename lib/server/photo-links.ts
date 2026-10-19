import "server-only";

// Pasted photo links (spec 0005, "Photo links", AC-8). Only exact hosts over
// https, on every redirect hop, with one 3 second budget, so an agent can't point
// the server at an internal address.

export type PhotoLinkReason =
  | "host_not_allowed"
  | "redirect_not_allowed"
  | "not_an_image"
  | "too_large"
  | "unreachable"
  | "drive_not_shared"
  | "image_removed";

type Result = { ok: true; url: string } | { ok: false; reason: PhotoLinkReason };

const allowedHosts = new Set(["images.unsplash.com", "i.imgur.com", "res.cloudinary.com", "lh3.googleusercontent.com"]);
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const maxBytes = 15 * 1024 * 1024;
const maxRedirects = 2;
const timeoutMs = 3000;

const driveHost = "drive.google.com";
const driveId = /^[A-Za-z0-9_-]{10,}$/;

function parseHttps(input: string): URL | null {
  try {
    const url = new URL(input.trim());
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

// Google Drive share links become a direct image URL (step 2).
function driveImageUrl(url: URL): string | null {
  if (url.hostname !== driveHost) return null;
  const fromPath = /^\/file\/d\/([^/]+)/.exec(url.pathname)?.[1];
  const fromQuery = url.pathname === "/open" || url.pathname === "/uc" ? url.searchParams.get("id") : null;
  const id = fromPath ?? fromQuery;
  return id && driveId.test(id) ? `https://lh3.googleusercontent.com/d/${id}=w2000` : null;
}

// Exact host match, and Cloudinary uploads only, never its fetch proxy (step 3).
function hostAllowed(url: URL): boolean {
  if (url.protocol !== "https:" || !allowedHosts.has(url.hostname)) return false;
  if (url.hostname === "res.cloudinary.com") {
    const path = url.pathname.toLowerCase();
    return path.includes("/image/upload/") && !path.includes("/image/fetch/") && !path.includes("http");
  }
  return true;
}

// Steps 1 to 3: the URL to store, or why it can't be used.
export function normalizePhotoUrl(input: string): Result & { isDrive?: boolean } {
  const url = parseHttps(input);
  if (!url) return { ok: false, reason: "host_not_allowed" };
  const drive = driveImageUrl(url);
  if (url.hostname === driveHost && !drive) return { ok: false, reason: "drive_not_shared" };
  const target = new URL(drive ?? url.href);
  if (!hostAllowed(target)) return { ok: false, reason: "host_not_allowed" };
  return { ok: true, url: target.href, isDrive: drive !== null };
}

function sizeFrom(headers: Headers): number | null {
  const range = headers.get("content-range");
  const total = range ? /\/(\d+)\s*$/.exec(range)?.[1] : undefined;
  if (total) return Number(total);
  const length = headers.get("content-length");
  return length && /^\d+$/.test(length) ? Number(length) : null;
}

const isRemovedImgur = (url: URL) => url.hostname === "i.imgur.com" && url.pathname === "/removed.png";

// Steps 4 to 7: the link answers with a real image of an accepted type and size.
export async function checkPhotoUrl(
  normalizedUrl: string,
  options: { isDrive?: boolean; fetch?: typeof fetch } = {},
): Promise<Result> {
  const doFetch = options.fetch ?? fetch;
  const failAs = (reason: PhotoLinkReason): Result => ({
    ok: false,
    reason: options.isDrive && reason !== "too_large" ? "drive_not_shared" : reason,
  });
  const signal = AbortSignal.timeout(timeoutMs);
  let current = new URL(normalizedUrl);

  try {
    for (let hop = 0; ; hop++) {
      if (isRemovedImgur(current)) return { ok: false, reason: "image_removed" };
      const response = await doFetch(current.href, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        redirect: "manual",
        credentials: "omit",
        cache: "no-store",
        signal,
      });

      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        const location = response.headers.get("location");
        if (!location || hop >= maxRedirects) return failAs("redirect_not_allowed");
        const next = new URL(location, current);
        if (isRemovedImgur(next)) return { ok: false, reason: "image_removed" };
        if (!hostAllowed(next)) return failAs("redirect_not_allowed");
        current = next;
        continue;
      }

      // Never read the body: the host may have ignored `Range`.
      await response.body?.cancel();
      if (response.status !== 200 && response.status !== 206) return failAs("unreachable");
      const type = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
      if (!imageTypes.has(type)) return failAs("not_an_image");
      const size = sizeFrom(response.headers);
      if (size !== null && size > maxBytes) return { ok: false, reason: "too_large" };
      return { ok: true, url: normalizedUrl };
    }
  } catch {
    // Timeout, DNS, TLS, or a malformed redirect.
    return failAs("unreachable");
  }
}
