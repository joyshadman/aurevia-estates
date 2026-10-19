"use client";

import { ChevronLeft, ChevronRight, Images } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ListingImage } from "@/components/listing/listing-image";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";

type Photo = { id: string; url: string; alt: string };

// The property gallery (spec 0009, AC-4): the cover large with up to 4 more
// beside it, and a full screen viewer with arrows, keys, and swipe.
export function Gallery({ photos, title }: { photos: Photo[]; title: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const close = useCallback(() => setOpen(null), []);

  if (photos.length === 0) {
    return <ListingImage src={null} alt={title} className="aspect-[16/9] rounded-[28px]" />;
  }

  const tiles = photos.slice(1, 5);
  return (
    <div className="relative">
      <div className={cn("grid gap-2", tiles.length > 0 && "lg:grid-cols-4 lg:grid-rows-2")}>
        <button
          type="button"
          onClick={() => setOpen(0)}
          className={cn("overflow-hidden rounded-[28px] lg:rounded-r-none", tiles.length > 0 ? "lg:col-span-2 lg:row-span-2" : "")}
          aria-label={`View photo 1 of ${photos.length}: ${photos[0].alt}`}
        >
          <ListingImage src={photos[0].url} alt={photos[0].alt} priority className="aspect-[4/3] lg:aspect-auto lg:h-full lg:min-h-[420px]" />
        </button>
        {tiles.length > 0 ? (
          <div className="grid grid-cols-4 gap-2 lg:col-span-2 lg:row-span-2 lg:grid-cols-2">
            {tiles.map((photo, i) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => setOpen(i + 1)}
                className={cn("overflow-hidden rounded-xl", i === 1 && "lg:rounded-tr-[28px]", i === 3 && "lg:rounded-br-[28px]")}
                aria-label={`View photo ${i + 2} of ${photos.length}: ${photo.alt}`}
              >
                <ListingImage src={photo.url} alt={photo.alt} layout="list" className="aspect-[4/3] lg:aspect-auto lg:h-full" />
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {photos.length > 5 ? (
        <Button intent="secondary" size="sm" className="absolute right-4 bottom-4" onClick={() => setOpen(0)}>
          <Images aria-hidden="true" className="h-4 w-4" />
          View all {photos.length} photos
        </Button>
      ) : null}
      <Viewer photos={photos} index={open} onIndex={setOpen} onClose={close} title={title} />
    </div>
  );
}

function Viewer({
  photos,
  index,
  onIndex,
  onClose,
  title,
}: {
  photos: Photo[];
  index: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
  title: string;
}) {
  const touchStart = useRef<number | null>(null);
  const current = index ?? 0;
  const go = useCallback((step: number) => onIndex((current + step + photos.length) % photos.length), [current, onIndex, photos.length]);
  const photo = photos[current];

  // Left and right arrows move between photos wherever focus is in the viewer.
  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, go]);

  return (
    <Dialog
      open={index !== null}
      onClose={onClose}
      title={title}
      description={`${current + 1} of ${photos.length}`}
      className="h-[95vh] max-h-[95vh] w-[calc(100%-1rem)] max-w-6xl"
    >
      <div
        className="flex h-full flex-col gap-3"
        onPointerDown={(e) => {
          touchStart.current = e.clientX;
        }}
        onPointerUp={(e) => {
          if (touchStart.current === null) return;
          const dx = e.clientX - touchStart.current;
          touchStart.current = null;
          if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        }}
      >
        <div className="relative min-h-0 flex-1">
          {photo ? <ListingImage key={photo.id} src={photo.url} alt={photo.alt} className="h-full min-h-[50vh] rounded-xl [&_img]:object-contain" /> : null}
        </div>
        <div className="flex items-center justify-between gap-3">
          <Button intent="secondary" icon aria-label="Previous photo" onClick={() => go(-1)} disabled={photos.length < 2}>
            <ChevronLeft aria-hidden="true" className="h-5 w-5" />
          </Button>
          <p className="text-center text-sm text-fg-muted" aria-live="polite">
            {photo?.alt}
          </p>
          <Button intent="secondary" icon aria-label="Next photo" onClick={() => go(1)} disabled={photos.length < 2}>
            <ChevronRight aria-hidden="true" className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
