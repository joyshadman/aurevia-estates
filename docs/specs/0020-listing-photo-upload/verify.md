# Verify: Listing photo upload · spec 0020 · updated 2026-10-26
_Steps derived from spec 0020 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. Steps marked "(run by /develop)" passed against the dev database on 2026-10-26 through the service and HTTP; the browser steps have not been clicked through yet._

## UI / manual
- [ ] As an agent, open a draft listing → "Upload photos" → pick 3 phone photos → "Uploading 1 of 3…", then all three appear; the first becomes the cover → AC-1
- [ ] Upload a 6 MB photo straight from a phone → it uploads (the browser shrinks it first) → AC-1
- [ ] Upload a PDF renamed to `.jpg` → "That file isn't a JPEG, PNG, or WebP photo." → AC-3
- [ ] Reorder, set cover, edit alt text, and remove an uploaded photo → same behavior as a link photo; a published listing's cover can't be removed → AC-4
- [ ] Publish, then open the property page → the gallery loads `/_next/image?url=/photos/...` at card and gallery sizes → AC-5

## Commands
- [x] Upload a 3000×2000 JPEG with GPS EXIF → stored WebP 2000×1333, EXIF empty, first photo is cover (run by /develop) → AC-1, AC-2
- [x] Same file again → `duplicate`; 800×400 → `photo_too_small`; text bytes → `upload_not_image`; 5 MB → `upload_too_large`; a non owner → `forbidden` (run by /develop) → AC-1, AC-3
- [x] Remove the photo, and delete a draft with a photo → the `photo_files` row is gone both times (run by /develop) → AC-4
- [x] `curl -I /photos/<sha>.webp` → 200, `image/webp`, `public, max-age=31536000, immutable`; an unknown hash → 404; `/_next/image?url=/photos/<sha>.webp&w=640` → 200 WebP (run by /develop) → AC-5
- [ ] `select sha256, byte_size from photo_files` after a real phone upload → byte size near 100 to 400 KB → AC-2

## Acceptance-criteria coverage
- AC-1: UI 1, 2, cmds 1, 2 · AC-2: cmds 1, 5 · AC-3: UI 3, cmd 2 · AC-4: UI 4, cmd 3 · AC-5: UI 5, cmd 4
