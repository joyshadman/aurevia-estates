import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { discoveryPath } from "@/lib/domain/discovery";
import type { ListingCardDTO } from "@/lib/domain/listing-card";
import { routes } from "@/lib/nav";

// A listing's public page (spec 0012, AC-6).
export const listingHref = (slug: string) => `${discoveryPath}/${encodeURIComponent(slug)}`;

// The assistant with this home in context (spec 0006's start listing).
export const askAboutHref = (slug: string) => `${routes.assistant}?${new URLSearchParams({ listing: slug })}`;

// The footer button every public listing card carries (specs 0010, 0011, 0012).
export function ListingCardLink({ listing }: { listing: Pick<ListingCardDTO, "slug" | "title"> }) {
  return (
    <Button href={askAboutHref(listing.slug)} intent="secondary" size="sm">
      <Sparkles aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
      Ask about this home
      <span className="sr-only">: {listing.title}</span>
    </Button>
  );
}
