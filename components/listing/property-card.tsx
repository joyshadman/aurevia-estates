import { MapPin } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { FavoriteButton } from "@/components/listing/favorite-button";
import { ListingImage } from "@/components/listing/listing-image";
import { PriceTag } from "@/components/listing/price-tag";
import { SpecChips } from "@/components/listing/spec-chips";
import { cn } from "@/lib/cn";
import { propertyTypeLabels, type ListingCardDTO } from "@/lib/domain/listing-card";

type PropertyCardProps = {
  listing: ListingCardDTO;
  layout?: "grid" | "list";
  // Without `href` the card has no link (chat cards before feature 10, spec 0006).
  href?: string;
  favorite?: { pressed: boolean; pending?: boolean; onToggle: () => void };
  // Slots for the chat: match badge, why lines, and actions (spec 0006).
  badge?: ReactNode;
  footer?: ReactNode;
  className?: string;
};

// Stretched link pattern: the title link covers the card through ::after; the
// heart and footer sit above it, so no control is nested in a link (spec 0003).
export function PropertyCard({ listing, layout = "grid", href, favorite, badge, footer, className }: PropertyCardProps) {
  const list = layout === "list";

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-line bg-surface-raised transition duration-base",
        href && "hover:-translate-y-0.5 hover:shadow-lift",
        list && "sm:flex",
        className,
      )}
    >
      <div className={cn("relative", list ? "sm:w-[280px] sm:shrink-0" : "")}>
        <ListingImage
          src={listing.cover?.url ?? null}
          alt={listing.cover?.alt ?? listing.title}
          layout={layout}
          className={cn("aspect-[4/3]", list && "sm:h-full sm:aspect-auto")}
        />
        {badge ? <div className="absolute top-4 left-4 z-10">{badge}</div> : null}
        {favorite ? (
          <FavoriteButton
            pressed={favorite.pressed}
            pending={favorite.pending}
            onToggle={favorite.onToggle}
            className="absolute top-4 right-4 z-10"
          />
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-6">
        <PriceTag priceBdt={listing.priceBdt} negotiable={listing.priceNegotiable} />
        <h3 className="mt-3 text-[15px] font-medium text-fg">
          {href ? (
            <Link href={href} className="after:absolute after:inset-0 after:content-[''] hover:text-accent">
              {listing.title}
            </Link>
          ) : (
            listing.title
          )}
        </h3>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-fg-muted">
          <MapPin aria-hidden="true" strokeWidth={1.5} className="h-4 w-4 shrink-0 text-fg-subtle" />
          {listing.areaName}
          <span aria-hidden="true">·</span>
          {propertyTypeLabels[listing.propertyType]}
          <span className="sr-only">, reference {listing.refCode}</span>
        </p>
        <SpecChips listing={listing} className="mt-5 border-t border-line pt-4" />
        {footer ? <div className="relative z-10 mt-4">{footer}</div> : null}
      </div>
    </article>
  );
}
