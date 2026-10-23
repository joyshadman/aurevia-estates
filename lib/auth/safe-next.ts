import { publicEnv } from "@/lib/env";

// AC-11 (spec 0004): only same site paths, checked against `NEXT_PUBLIC_SITE_URL`
// (never the request `Host`). Anything else returns null and is ignored
// silently. Pure, so the proxy, actions, and the email hook all share it.

const maxNextLength = 512;

export function safeNext(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length >= maxNextLength) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("\\") || /[\u0000-\u001f]/.test(value) || /%5c|%2f/i.test(value)) return null;
  const site = new URL(publicEnv().NEXT_PUBLIC_SITE_URL);
  let url: URL;
  try {
    url = new URL(value, site);
  } catch {
    return null;
  }
  if (url.origin !== site.origin) return null;
  if (/^\/(auth|api)(\/|$)/.test(url.pathname)) return null;
  return value;
}
