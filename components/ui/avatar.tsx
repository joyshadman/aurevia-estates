"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { isOptimizableImage } from "@/lib/images";

const sizes = { sm: 32, md: 40, lg: 72 } as const;

// Initials: first letters of the first two words of the name, else the first
// letter of the email (spec 0003).
export function initialsFor(name: string | null | undefined, email: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length > 0) return words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return (email?.trim()[0] ?? "?").toUpperCase();
}

export function Avatar({
  src,
  name,
  email,
  size = "md",
  className,
}: {
  src?: string | null;
  name?: string | null;
  email?: string | null;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const px = sizes[size];

  if (src && !failed) {
    return (
      <Image
        src={src}
        alt=""
        width={px}
        height={px}
        unoptimized={!isOptimizableImage(src)}
        onError={() => setFailed(true)}
        className={cn("shrink-0 rounded-full object-cover", className)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      style={{ width: px, height: px }}
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-accent-subtle font-medium text-accent-subtle-fg",
        size === "lg" ? "text-xl" : "text-xs",
        className,
      )}
    >
      {initialsFor(name, email)}
    </span>
  );
}
