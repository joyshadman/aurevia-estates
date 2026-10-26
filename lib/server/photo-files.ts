import "server-only";
import { createHash } from "node:crypto";
import sharp, { type Metadata } from "sharp";
import type { Prisma } from "@/lib/generated/prisma/client";
import { db } from "@/lib/server/db";

// Uploaded photo bytes in Neon (spec 0020; spec 0001, *File storage*). Every
// upload is re-encoded here, whatever the browser sent: rotated by EXIF, fit
// inside 2000px, WebP, and stripped of all metadata, so no GPS is ever stored.

export const maxUploadBytes = 4 * 1024 * 1024;
const maxSide = 2000;
const minShortSide = 600;
const acceptedFormats = new Set(["jpeg", "png", "webp"]);

export type ProcessedPhoto = { sha256: string; bytes: Uint8Array<ArrayBuffer>; width: number; height: number };
export type UploadRefusal = "upload_too_large" | "upload_not_image" | "photo_too_small";

// AC-2, AC-3.
export async function processUpload(input: Uint8Array): Promise<{ ok: true; photo: ProcessedPhoto } | { ok: false; reason: UploadRefusal }> {
  if (input.byteLength > maxUploadBytes) return { ok: false, reason: "upload_too_large" };

  // The format comes from the bytes, never from the file name or type.
  let meta: Metadata;
  try {
    meta = await sharp(input, { failOn: "error", limitInputPixels: 50_000_000 }).metadata();
  } catch {
    return { ok: false, reason: "upload_not_image" };
  }
  if (!meta.format || !acceptedFormats.has(meta.format) || !meta.width || !meta.height) return { ok: false, reason: "upload_not_image" };
  const shortSide = Math.min(meta.width, meta.height);
  if (shortSide < minShortSide) return { ok: false, reason: "photo_too_small" };

  const { data, info } = await sharp(input, { failOn: "error", limitInputPixels: 50_000_000 })
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });

  const bytes = new Uint8Array(data);
  return {
    ok: true,
    photo: { sha256: createHash("sha256").update(bytes).digest("hex"), bytes, width: info.width, height: info.height },
  };
}

// The same bytes uploaded twice share one row.
export async function storePhotoFileIn(tx: Prisma.TransactionClient, photo: ProcessedPhoto, createdById: string) {
  await tx.$executeRaw`
    INSERT INTO photo_files (sha256, bytes, width, height, byte_size, created_by)
    VALUES (${photo.sha256}, ${photo.bytes}, ${photo.width}, ${photo.height}, ${photo.bytes.byteLength}, ${createdById}::uuid)
    ON CONFLICT (sha256) DO NOTHING`;
}

// AC-4: a file no photo points to any more goes in the same transaction.
export async function deleteOrphanPhotoFilesIn(tx: Prisma.TransactionClient, hashes: (string | null)[]) {
  const candidates = hashes.filter((hash): hash is string => Boolean(hash));
  if (candidates.length === 0) return;
  await tx.$executeRaw`
    DELETE FROM photo_files f
    WHERE f.sha256 = ANY(${candidates}::text[])
      AND NOT EXISTS (SELECT 1 FROM listing_photos p WHERE p.storage_path = f.sha256)`;
}

// The photo route's one read (AC-5).
export async function readPhotoFile(sha256: string) {
  return db.photoFile.findUnique({ where: { sha256 }, select: { bytes: true } });
}
