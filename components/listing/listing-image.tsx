"use client";

import { House } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { isOptimizableImage } from "@/lib/images";

const sizesByLayout = {
  grid: "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
  list: "(min-width: 640px) 280px, 100vw",
} as const;

// Photo in a tinted frame. No photo, or a photo that fails, keeps the frame and
// shows a house icon instead of a broken image (spec 0003 AC-12).
export function ListingImage({
  src,
  alt,
  layout = "grid",
  priority = false,
  className,
}: {
  src: string | null;
  alt: string;
  layout?: keyof typeof sizesByLayout;
  priority?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <div className={cn("relative overflow-hidden bg-surface-sunken", className)}>
      {showImage ? (
        <Image
          src={src!}
          alt={alt}
          fill
          sizes={sizesByLayout[layout]}
          priority={priority}
          unoptimized={!isOptimizableImage(src!)}
          onError={() => setFailed(true)}
          className="object-cover transition-transform duration-base group-hover:scale-[1.03]"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <House aria-hidden="true" strokeWidth={1.25} className="h-10 w-10 text-fg-subtle" />
          <span className="sr-only">{alt}, no photo available</span>
        </div>
      )}
    </div>
  );
}
