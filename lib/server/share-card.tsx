import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { formatPrice } from "@/lib/format";
import { getPublicListing, type PublicListing } from "@/lib/server/public-listings";

// The generated share card for a property (spec 0009, AC-8): 1200×630, the
// cover photo with title, area, price, and the wordmark set in Inter. Any
// failure (timeout, error, a WebP or AVIF cover the renderer can't read) falls
// back to the same text on the brand background.

export const shareCardSize = { width: 1200, height: 630 };

// Brand colors from spec 0003 (light theme); the image can't read CSS tokens.
const burgundy = "#853953";
const canvas = "#F3F4F4";
const charcoal = "#2C2C2C";

let inter: Promise<ArrayBuffer | null> | null = null;

// Google Fonts serves TrueType to clients that don't ask for woff2.
function loadInter() {
  inter ??= (async () => {
    try {
      const css = await fetch("https://fonts.googleapis.com/css2?family=Inter:wght@600", { signal: AbortSignal.timeout(3000) }).then((r) => r.text());
      const url = /url\((https:[^)]+)\) format\('truetype'\)/.exec(css)?.[1];
      if (!url) return null;
      return await fetch(url, { signal: AbortSignal.timeout(3000) }).then((r) => r.arrayBuffer());
    } catch {
      inter = null;
      return null;
    }
  })();
  return inter;
}

async function coverDataUrl(url: string | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    const type = response.headers.get("content-type")?.split(";")[0]?.trim();
    if (!response.ok || (type !== "image/jpeg" && type !== "image/png")) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function renderShareCard(listing: PublicListing) {
  const [font, cover] = await Promise.all([loadInter(), coverDataUrl(listing.photos[0]?.url)]);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: canvas, fontFamily: "Inter" }}>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" width={1200} height={630} style={{ position: "absolute", inset: 0, objectFit: "cover" }} />
        ) : null}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            flexDirection: "column",
            padding: "48px 56px",
            gap: 12,
            background: cover ? "linear-gradient(transparent, rgba(0,0,0,0.75))" : canvas,
            color: cover ? "#FFFFFF" : charcoal,
          }}
        >
          <div style={{ fontSize: 26, color: cover ? "#F4E9ED" : burgundy, letterSpacing: 4, textTransform: "uppercase" }}>
            Aurevia Estates · Sylhet
          </div>
          <div style={{ fontSize: 60, lineHeight: 1.1 }}>{listing.title}</div>
          <div style={{ display: "flex", gap: 24, fontSize: 34 }}>
            <span>{listing.area.nameEn}</span>
            <span>{formatPrice(listing.priceBdt)}</span>
          </div>
        </div>
      </div>
    ),
    { ...shareCardSize, fonts: font ? [{ name: "Inter", data: font, weight: 600, style: "normal" }] : undefined },
  );
}

// The finished image (JPEG), cached per listing under the same tags as the page, so the
// font and cover are fetched once and an agent's change redraws it.
export async function shareCardImage(slug: string): Promise<Uint8Array | null> {
  "use cache";
  cacheTag("listings");
  const result = await getPublicListing(slug);
  if (!result) {
    cacheLife("seconds");
    return null;
  }
  cacheTag(`listing:${result.listing.id}`);
  cacheLife("days");
  const response = await renderShareCard(result.listing);
  // JPEG keeps the card small (a photo PNG is over 1 MB), since WhatsApp skips
  // previews for large images.
  const png = Buffer.from(await response.arrayBuffer());
  return new Uint8Array(await sharp(png).jpeg({ quality: 80, mozjpeg: true }).toBuffer());
}
