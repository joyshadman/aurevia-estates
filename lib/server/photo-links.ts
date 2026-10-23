import "server-only";

// Pasted photo links (spec 0005, AC-8, *Photo links*). Only exact hosts over
// https on every hop, no cookies, at most 2 redirects, 3 seconds in total, so
// the check can't be pointed at internal addresses. Keep the host list exact.

export type PhotoLinkReason =
  | "host_not_allowed"
  | "redirect_not_allowed"
  | "not_an_image"
  | "too_large"
  | "unreachable"
  | "drive_not_shared"
  | "image_removed";

export type PhotoLinkResult = { ok: true; url: string } | { ok: false; reason: PhotoLinkReason };

const allowedHosts = new Set(["images.unsplash.com", "i.imgur.com", "res.cloudinary.com", "lh3.googleusercontent.com"]);
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const maxBytes = 15 * 1024 * 1024;
const maxRedirects = 2;
const timeoutMs = 3000;

// Drive share links become a direct image on `lh3.googleusercontent.com`.
function driveFileId(url: URL): string | null {
  if (url.hostname !== "drive.google.com") return null;
  const fromPath = /^\/file\/d\/([\w-]+)/.exec(url.pathname)?.[1];
  if (fromPath) return fromPath;
  if (url.pathname === "/open" || url.pathname === "/uc") return url.searchParams.get("id")?.match(/^[\w-]+$/)?.[0] ?? null;
  return null;
}

function hostAllowed(url: URL): boolean {
  if (url.protocol !== "https:" || !allowedHosts.has(url.hostname)) return false;
  if (url.hostname === "res.cloudinary.com") {
    // Uploaded images only: never the `/image/fetch/` proxy or an embedded URL.
    const path = decodeURIComponent(url.pathname);
    return path.includes("/image/upload/") && !path.includes("/image/fetch/") && !/https?:/i.test(path);
  }
  return true;
}

// Step 1 to 3: parse, convert Drive, check the host. No network.
export function normalizePhotoUrl(input: string): { ok: true; url: URL; isDrive: boolean } | { ok: false; reason: "host_not_allowed" } {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { ok: false, reason: "host_not_allowed" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "host_not_allowed" };
  const driveId = driveFileId(url);
  if (driveId) return { ok: true, url: new URL(`https://lh3.googleusercontent.com/d/${driveId}=w2000`), isDrive: true };
  if (!hostAllowed(url)) return { ok: false, reason: "host_not_allowed" };
  url.hash = "";
  return { ok: true, url, isDrive: false };
}

function sizeOf(headers: Headers): number | null {
  const total = /\/(\d+)$/.exec(headers.get("content-range") ?? "")?.[1];
  if (total) return Number(total);
  const length = headers.get("content-length");
  // With a 206, content-length is the range's length, not the file's.
  return length && !headers.get("content-range") ? Number(length) : null;
}

// Steps 4 to 7: one ranged GET, redirects followed by hand.
export async function checkPhotoUrl(input: string): Promise<PhotoLinkResult> {
  const normalized = normalizePhotoUrl(input);
  if (!normalized.ok) return normalized;
  const { isDrive } = normalized;
  const fail = (reason: PhotoLinkReason): PhotoLinkResult => ({
    ok: false,
    reason: isDrive && reason !== "too_large" ? "drive_not_shared" : reason,
  });

  const signal = AbortSignal.timeout(timeoutMs);
  let current = normalized.url;
  try {
    for (let hop = 0; ; hop++) {
      const response = await fetch(current, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        redirect: "manual",
        credentials: "omit",
        signal,
      });
      // Never read the body, in case the host ignored `Range`.
      await response.body?.cancel();

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || hop >= maxRedirects) return fail("redirect_not_allowed");
        const next = new URL(location, current);
        // A private Drive file redirects to Google sign in.
        if (!hostAllowed(next)) return fail("redirect_not_allowed");
        current = next;
        continue;
      }
      if (response.status !== 200 && response.status !== 206) return fail("unreachable");

      const type = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
      if (!imageTypes.has(type)) return fail("not_an_image");
      const size = sizeOf(response.headers);
      if (size !== null && size > maxBytes) return fail("too_large");
      if (current.hostname === "i.imgur.com" && current.pathname === "/removed.png") return fail("image_removed");
      return { ok: true, url: normalized.url.toString() };
    }
  } catch {
    return fail("unreachable");
  }
}
