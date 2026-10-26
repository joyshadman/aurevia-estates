# 0020 · Listing photo upload

**Status**: Assumed
**Date**: 2026-10-26
**Authorized by**: joyshadman, during /develop ("architect with recommended")

## Owed decision
How an agent uploads a photo (limits, formats, the request path), how the bytes are stored and served, and what happens to stored bytes when a photo is removed. Storage itself is fixed by spec 0001 (*File storage*: WebP at most 2000px wide, `bytea` in `photo_files`, a route handler with immutable cache headers). Reorder, cover, alt text, and remove already exist for pasted links (spec 0005) and apply unchanged to uploads.

## Assumption built on
- **New table `photo_files`**: `sha256` text primary key (hex of the stored WebP bytes), `bytes` bytea, `width`, `height`, `byte_size` int, `created_by` (FK `profiles`, on delete set null), `created_at`. List queries never select `bytes`.
- **Link from a photo**: `listing_photos.storage_path` holds the `sha256` (the existing one source check keeps `url` null), plus `width` and `height`. `photoUrl()` returns `/photos/<sha256>.webp`.
- **Upload path**: a server action `uploadPhoto(formData)` (fields `listingId`, `expectedUpdatedAt`, `alt`, `file`), so it shares the listing lock, the `updated_at` conflict token, the 20 photo limit, and `updateTag` with the other photo actions. `serverActions.bodySizeLimit` goes to `5mb`. The browser first shrinks the image to at most 2000px on the long side (JPEG, quality 0.9) so uploads stay near 1 MB on slow connections; the server never trusts that.
- **Server checks** (`sharp`): file at most 4 MB; JPEG, PNG, or WebP by content (not by name); at least 600px on the short side; then rotate by EXIF, fit inside 2000×2000, WebP quality 80, all metadata dropped (no GPS ever stored). Same bytes on the same listing give `duplicate`. Same bytes elsewhere reuse the stored file (`on conflict do nothing`).
- **Serving**: `GET /photos/<sha256>.webp` (route handler) returns the bytes with `Content-Type: image/webp` and `Cache-Control: public, max-age=31536000, immutable`; an unknown hash gives 404. Public, no auth (listing photos are public once published; the hash can't be guessed for drafts).
- **Sized images**: `next/image` optimizes `/photos/**` (`images.localPatterns` with an empty `search`), so cards and galleries get resized images per `sizes`.
- **Removal**: removing a photo (or deleting a draft) deletes its `photo_files` row in the same transaction when no other `listing_photos` row points to it.

## Code area
`prisma/schema.prisma`, `prisma/migrations/*_photo_files/`, `lib/server/photos.ts`, `lib/server/photo-files.ts`, `lib/server/agent-listings.ts`, `app/dashboard/listings/actions.ts`, `app/dashboard/listings/[id]/photo-manager.tsx`, `app/dashboard/listings/messages.ts`, `app/photos/[file]/route.ts`, `lib/images.ts`, `next.config.ts`

## Requirements
- **AC-1**: An agent uploads a JPEG, PNG, or WebP to a listing they can edit; it appears in the list, the first photo becomes the cover, and the 20 photo limit and conflict token apply.
- **AC-2**: The stored file is WebP, at most 2000px on each side, with no EXIF or GPS data.
- **AC-3**: Files over 4 MB, not an image, or under 600px on the short side are refused with a clear message; nothing is stored.
- **AC-4**: Reorder, cover, alt text, and remove work on uploaded photos exactly as on links; removing the last use of a file deletes its bytes.
- **AC-5**: `/photos/<sha256>.webp` serves with immutable cache headers; listing cards and the property page load resized images through `next/image`.

## Ratify
This decision was recorded by /develop, not deliberated. Run `/architect listing photo upload` to deliberate and ratify it. Until then it stays flagged as an owed decision; it does not block marking the feature `done`.
