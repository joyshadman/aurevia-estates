import { Bath, BedDouble, LandPlot, Ruler, type LucideIcon } from "lucide-react";
import type { ListingCardDTO, PropertyType } from "@/lib/domain/listing-card";
import { formatKatha, formatSqft, pluralize } from "@/lib/format";
import { cn } from "@/lib/cn";

type ChipKey = "beds" | "baths" | "sqft" | "katha";

// Which chips each type shows, in order (spec 0003 *Spec chips*).
const chipsByType: Record<PropertyType, ChipKey[]> = {
  APARTMENT: ["beds", "baths", "sqft"],
  DUPLEX: ["beds", "baths", "sqft", "katha"],
  VILLA: ["beds", "baths", "sqft", "katha"],
  HOUSE: ["beds", "baths", "sqft", "katha"],
  PLOT: ["katha"],
  COMMERCIAL: ["sqft"],
};

type ChipSource = Pick<ListingCardDTO, "propertyType" | "bedrooms" | "bathrooms" | "builtUpSqft" | "landKatha">;

function chip(key: ChipKey, listing: ChipSource): { icon: LucideIcon; text: string } | null {
  switch (key) {
    case "beds":
      return listing.bedrooms == null ? null : { icon: BedDouble, text: pluralize(listing.bedrooms, "bed") };
    case "baths":
      return listing.bathrooms == null ? null : { icon: Bath, text: pluralize(listing.bathrooms, "bath") };
    case "sqft":
      return listing.builtUpSqft == null ? null : { icon: Ruler, text: formatSqft(listing.builtUpSqft) };
    case "katha":
      return listing.landKatha == null ? null : { icon: LandPlot, text: formatKatha(listing.landKatha) };
  }
}

export function SpecChips({ listing, className }: { listing: ChipSource; className?: string }) {
  const chips = chipsByType[listing.propertyType].map((key) => chip(key, listing)).filter((c) => c !== null);
  if (chips.length === 0) return null;

  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-2 text-sm text-fg-muted", className)}>
      {chips.map(({ icon: Icon, text }) => (
        <li key={text} className="inline-flex items-center gap-1.5">
          <Icon aria-hidden="true" strokeWidth={1.5} className="h-4 w-4 text-fg-subtle" />
          {text}
        </li>
      ))}
    </ul>
  );
}
