"use client";

import { ChevronLeft, ChevronRight, House, Share2 } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { isOptimizableImage } from "@/lib/images";

type Photo = { url: string; alt: string };

// The main photo plus thumbnails; arrows and the count move through them
// (spec 0012, *Gallery*). No lightbox.
export function Gallery({ photos, title }: { photos: Photo[]; title: string }) {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Set<number>>(new Set());
  const photo = photos[index];
  const go = (step: number) => setIndex((current) => (current + step + photos.length) % photos.length);

  return (
    <section aria-label="Photo gallery" className="mt-8">
      <div className="relative aspect-[16/10] overflow-hidden rounded-[28px] bg-surface-sunken lg:aspect-[16/8]">
        {photo && !failed.has(index) ? (
          <Image
            key={photo.url}
            src={photo.url}
            alt={photo.alt || `${title}, photo ${index + 1}`}
            fill
            loading={index === 0 ? "eager" : undefined}
            fetchPriority={index === 0 ? "high" : undefined}
            sizes="(min-width: 1280px) 1216px, 100vw"
            unoptimized={!isOptimizableImage(photo.url)}
            onError={() => setFailed((current) => new Set(current).add(index))}
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center">
            <House aria-hidden="true" strokeWidth={1.25} className="h-12 w-12 text-fg-subtle" />
            <span className="sr-only">{title}, no photo available</span>
          </div>
        )}
        {photos.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous photo"
              className="absolute top-1/2 left-4 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-surface-raised text-fg shadow-soft transition-colors duration-fast hover:bg-surface"
            >
              <ChevronLeft aria-hidden="true" strokeWidth={1.5} className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next photo"
              className="absolute top-1/2 right-4 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-surface-raised text-fg shadow-soft transition-colors duration-fast hover:bg-surface"
            >
              <ChevronRight aria-hidden="true" strokeWidth={1.5} className="h-5 w-5" />
            </button>
            <p aria-live="polite" className="absolute bottom-4 left-4 rounded-full bg-media-scrim px-3 py-1.5 text-xs text-on-media">
              {index + 1} of {photos.length}
            </p>
          </>
        ) : null}
      </div>
      {photos.length > 1 ? (
        <ul className="mt-3 flex gap-3 overflow-x-auto pb-1">
          {photos.map((thumb, thumbIndex) => (
            <li key={thumb.url} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(thumbIndex)}
                aria-label={`Show photo ${thumbIndex + 1}${thumb.alt ? `: ${thumb.alt}` : ""}`}
                aria-current={thumbIndex === index ? "true" : undefined}
                className={cn(
                  "relative block h-20 w-28 overflow-hidden rounded-xl bg-surface-sunken ring-offset-2 ring-offset-surface transition-opacity duration-fast",
                  thumbIndex === index ? "ring-2 ring-accent" : "hover:opacity-80",
                )}
              >
                {failed.has(thumbIndex) ? null : (
                  <Image src={thumb.url} alt="" fill sizes="112px" unoptimized={!isOptimizableImage(thumb.url)} className="object-cover" />
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

// The browser's share sheet, else copy the link.
export function ShareButton({ title, url }: { title: string; url: string }) {
  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast({ tone: "success", title: "Link copied" });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast({ tone: "danger", title: "Couldn't share this home", body: url });
    }
  };
  return (
    <Button type="button" intent="secondary" size="sm" onClick={share}>
      <Share2 aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
      Share
    </Button>
  );
}
