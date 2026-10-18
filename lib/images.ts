// Image hosts `next/image` may optimize (spec 0003, extended by spec 0005).
// Shared by `next.config.ts` and `ListingImage`, which renders other hosts unoptimized.

export const imageRemotePatterns = [
  { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
  { protocol: "https", hostname: "lh3.googleusercontent.com", pathname: "/**" },
  { protocol: "https", hostname: "i.imgur.com", pathname: "/**" },
  { protocol: "https", hostname: "res.cloudinary.com", pathname: "/*/image/upload/**" },
] as const;

const allowedHosts = new Set<string>(imageRemotePatterns.map((p) => p.hostname));

export function isOptimizableImage(src: string): boolean {
  try {
    const url = new URL(src);
    if (url.protocol !== "https:" || !allowedHosts.has(url.hostname)) return false;
    if (url.hostname === "res.cloudinary.com") return /^\/[^/]+\/image\/upload\//.test(url.pathname);
    return true;
  } catch {
    return false;
  }
}
