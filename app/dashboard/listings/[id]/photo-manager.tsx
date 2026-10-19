"use client";

import { ArrowDown, ArrowUp, Star, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { ListingImage } from "@/components/listing/listing-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { PhotoDTO } from "@/lib/server/agent-listings";
import { addPhotoAction, movePhotoAction, removePhotoAction, setCoverPhotoAction, updatePhotoAltAction } from "../actions";
import { useEditor } from "./editor-context";

// Photo links (spec 0005, AC-8): add by link, reorder, choose the cover, edit
// alt text, remove. The list comes from the server and refreshes after each action.
export function PhotoManager({ listingId, photos }: { listingId: string; photos: PhotoDTO[] }) {
  const { token, canEdit, settle } = useEditor();
  const [url, setUrl] = useState("");
  const [pending, startTransition] = useTransition();
  const full = photos.length >= 20;

  function add() {
    if (!url.trim()) return;
    startTransition(async () => {
      const result = await addPhotoAction({ listingId, expectedUpdatedAt: token, url: url.trim() });
      if (settle(result, "Photo added")) setUrl("");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {canEdit ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field
            id="photo-url"
            label="Photo link"
            hint="From Unsplash, Imgur, Cloudinary, or a Google Drive file shared with anyone with the link."
            className="flex-1"
          >
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              placeholder="https://images.unsplash.com/..."
              disabled={full}
            />
          </Field>
          <Button intent="secondary" onClick={add} loading={pending} disabled={full || !url.trim()} className="sm:mb-6">
            Add photo
          </Button>
        </div>
      ) : null}
      {full && canEdit ? <p className="text-sm text-fg-muted">A listing can have up to 20 photos.</p> : null}

      {photos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-fg-muted">
          No photos yet. The first one you add becomes the cover.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {photos.map((photo, index) => (
            <PhotoRow key={photo.id} photo={photo} index={index} count={photos.length} />
          ))}
        </ol>
      )}
    </div>
  );
}

function PhotoRow({ photo, index, count }: { photo: PhotoDTO; index: number; count: number }) {
  const { token, canEdit, settle } = useEditor();
  const [alt, setAlt] = useState(photo.alt);
  const [pending, startTransition] = useTransition();
  const n = index + 1;

  const run = (action: () => Promise<Parameters<typeof settle>[0]>, success?: string) =>
    startTransition(async () => {
      settle(await action(), success);
    });

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-line p-3 sm:flex-row sm:items-center">
      <ListingImage src={photo.url} alt={photo.alt} layout="list" className="aspect-[4/3] w-full shrink-0 rounded-lg sm:w-32" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-fg-subtle">Photo {n}</span>
          {photo.isCover ? <Badge tone="accent">Cover</Badge> : null}
        </div>
        <div className="flex gap-2">
          <label htmlFor={`alt-${photo.id}`} className="sr-only">
            Alt text for photo {n}
          </label>
          <Input
            id={`alt-${photo.id}`}
            value={alt}
            maxLength={160}
            onChange={(e) => setAlt(e.target.value)}
            disabled={!canEdit}
            className="h-9"
          />
          {canEdit && alt.trim() !== photo.alt ? (
            <Button
              size="sm"
              intent="secondary"
              loading={pending}
              onClick={() => run(() => updatePhotoAltAction({ photoId: photo.id, expectedUpdatedAt: token, alt }), "Alt text saved")}
            >
              Save
            </Button>
          ) : null}
        </div>
      </div>
      {canEdit ? (
        <div className="flex gap-1 sm:flex-col">
          <Button
            size="sm"
            intent="ghost"
            icon
            aria-label={`Move photo ${n} up`}
            disabled={index === 0 || pending}
            onClick={() => run(() => movePhotoAction({ photoId: photo.id, expectedUpdatedAt: token, direction: "up" }))}
          >
            <ArrowUp aria-hidden="true" className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            intent="ghost"
            icon
            aria-label={`Move photo ${n} down`}
            disabled={index === count - 1 || pending}
            onClick={() => run(() => movePhotoAction({ photoId: photo.id, expectedUpdatedAt: token, direction: "down" }))}
          >
            <ArrowDown aria-hidden="true" className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            intent="ghost"
            icon
            aria-label={`Make photo ${n} the cover`}
            disabled={photo.isCover || pending}
            onClick={() => run(() => setCoverPhotoAction({ photoId: photo.id, expectedUpdatedAt: token }), "Cover changed")}
          >
            <Star aria-hidden="true" className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            intent="ghost"
            icon
            aria-label={`Remove photo ${n}`}
            disabled={pending}
            onClick={() => run(() => removePhotoAction({ photoId: photo.id, expectedUpdatedAt: token }), "Photo removed")}
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </li>
  );
}
