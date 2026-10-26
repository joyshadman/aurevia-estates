"use client";

import { ArrowDown, ArrowUp, ImagePlus, Star, Trash2, Upload } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { ListingImage } from "@/components/listing/listing-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { PhotoDTO } from "@/lib/server/agent-listings";
import { shrinkPhoto } from "@/lib/shrink-photo";
import { addPhoto, movePhoto, removePhoto, setCoverPhoto, updatePhotoAlt, uploadPhoto } from "../actions";
import { listingMessages } from "../messages";
import type { RunAction } from "./listing-editor";

const maxPhotos = 20;

// Photos by upload (spec 0020) or by link (spec 0005, AC-8). The first photo becomes the cover; the
// cover of a published listing can't be removed.
export function PhotoManager({
  listingId,
  photos,
  setPhotos,
  canEdit,
  isPublished,
  runAction,
}: {
  listingId: string;
  photos: PhotoDTO[];
  setPhotos: (update: (photos: PhotoDTO[]) => PhotoDTO[]) => void;
  canEdit: boolean;
  isPublished: boolean;
  runAction: RunAction;
}) {
  const [addError, setAddError] = useState<string | null>(null);
  const [alts, setAlts] = useState<Record<string, string>>({});

  const onAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const url = String(data.get("url") ?? "").trim();
    const alt = String(data.get("alt") ?? "").trim() || undefined;
    if (!url) return;
    runAction(
      (token) => addPhoto({ listingId, expectedUpdatedAt: token, url, alt }),
      (result) => {
        if (!result.ok) {
          setAddError(listingMessages[result.reason]);
          return;
        }
        setAddError(null);
        setPhotos((current) => [...current, result.photo]);
        form.reset();
      },
    );
  };

  // Spec 0020, AC-1: files go up one at a time, each with the newest token.
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const uploadFiles = (files: File[]) => {
    const room = Math.max(0, maxPhotos - photos.length);
    const queue = files.slice(0, room);
    if (queue.length === 0) return;
    setUploadError(files.length > room ? listingMessages.photo_limit : null);
    setUploading({ done: 0, total: queue.length });

    const next = (index: number) => {
      if (index >= queue.length) {
        setUploading(null);
        return;
      }
      runAction(
        async (token) => {
          const data = new FormData();
          data.set("listingId", listingId);
          data.set("expectedUpdatedAt", token);
          data.set("file", await shrinkPhoto(queue[index]), queue[index].name);
          try {
            return await uploadPhoto(data);
          } catch {
            // A dropped connection or a body over the server's limit.
            return { ok: false as const, reason: "upload_failed" as const };
          }
        },
        (result) => {
          if (!result.ok) {
            setUploadError(`${queue[index].name}: ${listingMessages[result.reason]}`);
            setUploading(null);
            return;
          }
          setPhotos((current) => [...current, result.photo]);
          setUploading({ done: index + 1, total: queue.length });
          next(index + 1);
        },
      );
    };
    next(0);
  };

  const move = (photo: PhotoDTO, direction: "up" | "down") =>
    runAction(
      (token) => movePhoto({ photoId: photo.id, expectedUpdatedAt: token, direction }),
      (result) => {
        if (!result.ok) return;
        setPhotos((current) => {
          const index = current.findIndex((p) => p.id === photo.id);
          const other = direction === "up" ? index - 1 : index + 1;
          if (index < 0 || other < 0 || other >= current.length) return current;
          const next = [...current];
          [next[index], next[other]] = [next[other], next[index]];
          return next;
        });
      },
    );

  const makeCover = (photo: PhotoDTO) =>
    runAction(
      (token) => setCoverPhoto({ photoId: photo.id, expectedUpdatedAt: token }),
      (result) => {
        if (result.ok) setPhotos((current) => current.map((p) => ({ ...p, isCover: p.id === photo.id })));
      },
    );

  const saveAlt = (photo: PhotoDTO) => {
    const alt = (alts[photo.id] ?? photo.alt).trim();
    if (!alt || alt === photo.alt) return;
    runAction(
      (token) => updatePhotoAlt({ photoId: photo.id, expectedUpdatedAt: token, alt }),
      (result) => {
        if (result.ok) setPhotos((current) => current.map((p) => (p.id === photo.id ? { ...p, alt } : p)));
      },
    );
  };

  const remove = (photo: PhotoDTO) =>
    runAction(
      (token) => removePhoto({ photoId: photo.id, expectedUpdatedAt: token }),
      (result) => {
        if (!result.ok) return;
        setPhotos((current) => {
          const rest = current.filter((p) => p.id !== photo.id);
          // The server moves a removed cover to the next photo.
          if (photo.isCover && rest.length > 0 && !rest.some((p) => p.isCover)) rest[0] = { ...rest[0], isCover: true };
          return rest;
        });
      },
    );

  return (
    <div className="flex flex-col gap-6">
      {photos.length === 0 ? (
        <p className="text-sm text-fg-muted">No photos yet. The first one you add becomes the cover.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {photos.map((photo, index) => (
            <li key={photo.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-line p-3">
              <ListingImage src={photo.url} alt={photo.alt} layout="list" className="h-16 w-24 shrink-0 rounded-xl" />
              <div className="flex min-w-48 flex-1 flex-col gap-2">
                <div className="flex items-center gap-2 text-xs text-fg-muted">
                  Photo {index + 1}
                  {photo.isCover ? <Badge tone="accent">Cover</Badge> : null}
                </div>
                <label className="sr-only" htmlFor={`alt-${photo.id}`}>
                  Alt text for photo {index + 1}
                </label>
                <Input
                  id={`alt-${photo.id}`}
                  value={alts[photo.id] ?? photo.alt}
                  maxLength={160}
                  disabled={!canEdit}
                  onChange={(event) => setAlts((current) => ({ ...current, [photo.id]: event.target.value }))}
                  onBlur={() => saveAlt(photo)}
                  className="h-9"
                />
              </div>
              {canEdit ? (
                <div className="flex flex-wrap gap-1">
                  <Button type="button" intent="ghost" size="sm" icon aria-label={`Move photo ${index + 1} up`} disabled={index === 0} onClick={() => move(photo, "up")}>
                    <ArrowUp aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    intent="ghost"
                    size="sm"
                    icon
                    aria-label={`Move photo ${index + 1} down`}
                    disabled={index === photos.length - 1}
                    onClick={() => move(photo, "down")}
                  >
                    <ArrowDown aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    intent="ghost"
                    size="sm"
                    icon
                    aria-label={`Make photo ${index + 1} the cover`}
                    disabled={photo.isCover}
                    onClick={() => makeCover(photo)}
                  >
                    <Star aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    intent="ghost"
                    size="sm"
                    icon
                    aria-label={`Remove photo ${index + 1}`}
                    disabled={photo.isCover && isPublished}
                    title={photo.isCover && isPublished ? listingMessages.last_cover : undefined}
                    onClick={() => remove(photo)}
                  >
                    <Trash2 aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      {canEdit && photos.length < maxPhotos ? (
        <div className="flex flex-col gap-3 rounded-2xl bg-surface-sunken p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" intent="primary" loading={uploading !== null} onClick={() => fileInput.current?.click()}>
              <Upload aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
              Upload photos
            </Button>
            <p className="text-sm text-fg-muted" aria-live="polite">
              {uploading ? `Uploading ${uploading.done + 1} of ${uploading.total}…` : "JPEG, PNG, or WebP, up to 4 MB each."}
            </p>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              uploadFiles(files);
            }}
          />
          {uploadError ? (
            <p role="alert" className="text-sm text-danger">
              {uploadError}
            </p>
          ) : null}
        </div>
      ) : null}

      {canEdit && photos.length < maxPhotos ? (
        <form onSubmit={onAdd} noValidate className="flex flex-col gap-4 rounded-2xl bg-surface-sunken p-4">
          <Field
            id="photo-url"
            label="Photo link"
            hint="From Unsplash, Imgur, Cloudinary, or a Google Drive file shared with anyone with the link."
            error={addError ?? undefined}
            showError={Boolean(addError)}
          >
            <Input name="url" type="url" inputMode="url" placeholder="https://" />
          </Field>
          <Field id="photo-alt" label="Alt text (optional)" hint="Describe the photo for people who can't see it. Defaults to the title.">
            <Input name="alt" maxLength={160} />
          </Field>
          <div>
            <Button type="submit" intent="secondary">
              <ImagePlus aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
              Add photo
            </Button>
          </div>
        </form>
      ) : null}
      {photos.length >= maxPhotos ? <p className="text-sm text-fg-muted">{listingMessages.photo_limit}</p> : null}
    </div>
  );
}
