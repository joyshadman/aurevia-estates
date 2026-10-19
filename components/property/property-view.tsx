import { Check, ExternalLink, MapPin, MessageCircle, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PriceTag } from "@/components/listing/price-tag";
import { SpecChips } from "@/components/listing/spec-chips";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { NearbyPlaces } from "@/components/maps/nearby-places";
import { PropertyMap } from "@/components/maps/property-map";
import { cn } from "@/lib/cn";
import { googleMapsLink } from "@/lib/domain/geo";
import { publicEnv } from "@/lib/env";
import { propertyTypeLabels } from "@/lib/domain/listing-card";
import { Gallery } from "./gallery";
import { PlainText } from "./plain-text";
import { SaveButton } from "@/components/listing/save-heart";
import { ShareButton } from "./share-button";
import { SpecsTable } from "./specs-table";
import { assistantLinks, type PropertyViewModel } from "./view-model";

const taka = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

// The address line, with the area added only when the line doesn't already name it.
function addressText(addressLine: string | null, areaName: string) {
  if (!addressLine) return areaName;
  return addressLine.toLowerCase().includes(areaName.toLowerCase()) ? addressLine : `${addressLine}, ${areaName}`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`section-${title}`} className="border-t border-line pt-8">
      <h2 id={`section-${title}`} className="font-display text-2xl text-fg">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

// The property page body (spec 0009): public, or an agent's preview of any status.
export function PropertyView({
  view,
  canonicalUrl,
  similar,
}: {
  view: PropertyViewModel;
  canonicalUrl: string;
  similar?: ReactNode;
}) {
  const links = assistantLinks(view);
  const preview = view.mode === "preview";
  const showChat = !view.sold;
  const lat = view.latitude;
  const lng = view.longitude;

  // In the agent preview the actions show but do nothing (AC-10).
  const chatButtons = (className?: string) =>
    preview ? (
      <>
        <Button disabled className={className}>
          Book a viewing
        </Button>
        <Button intent="secondary" disabled className={className}>
          <Sparkles aria-hidden="true" className="h-4 w-4" />
          Ask about this home
        </Button>
      </>
    ) : (
      <>
        <Button href={links.book} className={className}>
          Book a viewing
        </Button>
        <Button href={links.ask} intent="secondary" className={className}>
          <Sparkles aria-hidden="true" className="h-4 w-4" />
          Ask about this home
        </Button>
      </>
    );

  return (
    <Container className={showChat ? "pt-8 pb-28 lg:pb-16" : "py-8 lg:pb-16"}>
      {preview ? (
        <p role="status" className="mb-6 rounded-xl bg-warning-subtle px-4 py-3 text-sm text-warning-subtle-fg">
          Preview, not public. Status: {view.status.toLowerCase().replace("_", " ")}.
        </p>
      ) : null}

      <nav aria-label="Breadcrumb" className="text-sm text-fg-subtle">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/" className="hover:text-accent">
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href={`/properties?type=${view.propertyType.toLowerCase()}`} className="hover:text-accent">
              {propertyTypeLabels[view.propertyType]}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href={`/properties?area=${view.areaSlug}`} className="hover:text-accent">
              {view.areaName}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-fg-muted">
            {view.title}
          </li>
        </ol>
      </nav>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
            <span>{propertyTypeLabels[view.propertyType]} · For sale</span>
            <span aria-hidden="true">·</span>
            <span>Ref. {view.refCode}</span>
            {view.sold ? <Badge tone="accent">Sold</Badge> : null}
          </div>
          <h1 className="mt-2 font-display text-4xl text-fg sm:text-5xl">{view.title}</h1>
          <p className="mt-2 flex items-center gap-1.5 text-fg-muted">
            <MapPin aria-hidden="true" strokeWidth={1.5} className="h-4 w-4 shrink-0" />
            {addressText(view.addressLine, view.areaName)}
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          {view.priceBdt !== null ? (
            <PriceTag priceBdt={view.priceBdt} negotiable={view.priceNegotiable} size="lg" />
          ) : (
            <p className="font-display text-3xl text-fg-subtle">Price not set</p>
          )}
          {view.pricePerSqft !== null ? <p className="text-sm text-fg-muted">BDT {taka.format(view.pricePerSqft)} / sqft</p> : null}
          <div className="flex gap-2">
            {/* Only a PUBLISHED home can be saved (spec 0013). */}
            {!view.sold && !preview ? <SaveButton listingId={view.id} /> : null}
            <ShareButton title={view.title} url={canonicalUrl} disabled={preview} />
          </div>
        </div>
      </div>

      <div className="mt-8">
        <Gallery photos={view.photos} title={view.title} />
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <SpecChips listing={view} className="text-base" />

          {view.sold ? (
            <div className="flex flex-col gap-3 rounded-2xl bg-accent-subtle p-6 text-accent-subtle-fg sm:flex-row sm:items-center sm:justify-between">
              <p>This home has sold.</p>
              <Button href={links.similar}>Find similar homes</Button>
            </div>
          ) : null}

          <Section title="About this home">
            {view.description ? (
              <PlainText text={view.description} className="max-w-prose leading-relaxed text-fg" />
            ) : (
              <p className="text-fg-subtle">Description not set.</p>
            )}
          </Section>

          {view.amenities.length > 0 ? (
            <Section title="Amenities">
              <ul className="grid gap-3 sm:grid-cols-2">
                {view.amenities.map((amenity) => (
                  <li key={amenity.id} className="flex items-center gap-2 text-fg">
                    <Check aria-hidden="true" className="h-4 w-4 text-success" />
                    {amenity.label}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section title="Specifications">
            <SpecsTable view={view} />
          </Section>

          <Section title="Location">
            {/* The map and the agent's nearby places side by side (spec 0011, AC-4, AC-5). */}
            {(lat !== null && lng !== null) || view.nearbyPlaces.length > 0 ? (
              <div className={cn("mb-4 grid gap-6", view.nearbyPlaces.length > 0 && "md:grid-cols-[minmax(0,1fr)_15rem]")}>
                {lat !== null && lng !== null ? (
                  <PropertyMap apiKey={publicEnv().NEXT_PUBLIC_MAPTILER_KEY ?? null} lat={lat} lng={lng} title={view.title} areaName={view.areaName} />
                ) : null}
                <NearbyPlaces places={view.nearbyPlaces} />
              </div>
            ) : null}
            <p className="text-fg">{view.areaName}, Sylhet</p>
            {lat !== null && lng !== null ? (
              <a
                href={googleMapsLink(lat, lng)}
                target="_blank"
                rel="noopener"
                className="mt-2 inline-flex items-center gap-1 text-accent hover:underline"
              >
                Open in Google Maps
                <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : (
              <p className="mt-2 text-sm text-fg-subtle">Location not set.</p>
            )}
          </Section>
        </div>

        <aside aria-label="Your advisor" className="flex flex-col gap-5 self-start rounded-2xl border border-line bg-surface-raised p-6 lg:sticky lg:top-24">
          {view.advisor ? (
            <div className="flex items-center gap-3">
              <Avatar src={view.advisor.photoUrl} name={view.advisor.name} size="md" />
              <div>
                <p className="font-medium text-fg">{view.advisor.name}</p>
                {view.advisor.title ? <p className="text-sm text-fg-muted">{view.advisor.title}</p> : null}
              </div>
            </div>
          ) : (
            <p className="font-medium text-fg">An Aurevia advisor</p>
          )}
          {view.advisor?.whatsapp && !view.sold ? (
            <Button
              href={`https://wa.me/${view.advisor.whatsapp}?text=${encodeURIComponent(`Hello, I'm asking about ${view.title} (${view.refCode})`)}`}
              intent="secondary"
              target="_blank"
            >
              <MessageCircle aria-hidden="true" className="h-4 w-4" />
              WhatsApp {view.advisor.name.split(" ")[0]}
            </Button>
          ) : null}
          {showChat ? <div className="hidden flex-col gap-2 lg:flex">{chatButtons()}</div> : null}
          {showChat ? <p className="text-xs text-fg-subtle">The Aurevia Assistant answers questions and books viewings.</p> : null}
        </aside>
      </div>

      {similar}

      {showChat ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface-raised/95 p-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-md gap-2">{chatButtons("flex-1 px-3")}</div>
        </div>
      ) : null}
    </Container>
  );
}
