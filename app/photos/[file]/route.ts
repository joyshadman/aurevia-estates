import { readPhotoFile } from "@/lib/server/photo-files";

// Uploaded listing photos (spec 0020, AC-5; spec 0001, *Photos in the
// database*). The URL carries the hash of the bytes, so a response never
// changes: the CDN and browsers keep it for a year.

const fileName = /^([0-9a-f]{64})\.webp$/;

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const match = fileName.exec((await params).file);
  if (!match) return new Response("Not found", { status: 404 });
  const photo = await readPhotoFile(match[1]);
  if (!photo) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(photo.bytes, {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(photo.bytes.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
