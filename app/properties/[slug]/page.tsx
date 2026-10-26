import { CalendarCheck, Check, MapPin, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { PriceTag } from "@/components/listing/price-tag";
import { PropertyCard } from "@/components/listing/property-card";
import { ListingMap } from "@/components/map/listing-map";
import { SpecChips } from "@/components/listing/spec-chips";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Container, Eyebrow } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { discoveryPath } from "@/lib/domain/discovery";
import { propertyTypeLabels } from "@/lib/domain/listing-card";
import { absoluteUrl, jsonLdHtml, listingJsonLd } from "@/lib/seo";
import { formatKatha, formatSqft } from "@/lib/format";
import { routes } from "@/lib/nav";
import { listingPage, publishedSlugs } from "@/lib/server/listing-page";
import type { ListingDTO } from "@/lib/server/listings";
import { SaveHomeButton } from "@/app/saved/save-home";
import { ListingCardLink, listingHref } from "../listing-href";
import { Gallery, ShareButton } from "./listing-client";

const completionLabels = { READY: "Ready to move in", UNDER_CONSTRUCTION: "Under construction" } as const;

const dhakaDate = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "long", year: "numeric" });
const monthYear = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });

const askHref = (slug: string) => `${routes.assistant}?${new URLSearchParams({ listing: slug })}`;

function summary(listing: ListingDTO): string {
  const text = listing.description.replace(/\s+/g, " ").trim();
  return text.length > 155 ? `${text.slice(0, 152).trimEnd()}…` : text;
}

// AC-4: a unique title, description, canonical URL, and social cards.
export async function generateMetadata({ params }: PageProps<"/properties/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = await listingPage(slug);
  if (!page) return { title: "Home not found" };
  const { listing } = page;
  const title = `${listing.title} · ${listing.area.nameEn}`;
  const url = absoluteUrl(listingHref(listing.slug));
  // Uploaded photos have a relative path (spec 0020); social cards need a full URL.
  const images = listing.cover ? [{ url: absoluteUrl(listing.cover.url), alt: listing.cover.alt || listing.title }] : [];
  return {
    title,
    description: summary(listing),
    alternates: { canonical: url },
    openGraph: { type: "website", url, title, description: summary(listing), siteName: "Aurevia Estates", images },
    twitter: { card: images.length > 0 ? "summary_large_image" : "summary", title, description: summary(listing), images },
  };
}

// Published homes prerender at build; newer ones render on first visit.
export async function generateStaticParams() {
  return (await publishedSlugs()).map((slug) => ({ slug }));
}

// `/properties/[slug]` (spec 0012): one published listing. Public and cached,
// so it reads no cookies (AC-5). With Partial Prefetching, `params` is read
// inside Suspense, so an unknown slug streams the not found page with
// `noindex` (AC-1).
export default function ListingPageRoute({ params }: PageProps<"/properties/[slug]">) {
  return (
    <Container className="pt-8 pb-20">
      <Suspense fallback={<PageSkeleton />}>
        <Listing params={params} />
      </Suspense>
    </Container>
  );
}

async function Listing({ params }: Pick<PageProps<"/properties/[slug]">, "params">) {
  const { slug } = await params;
  const page = await listingPage(slug);
  if (!page) notFound();
  const { listing, advisor, similar } = page;
  const type = propertyTypeLabels[listing.propertyType];
  const perSqft = listing.builtUpSqft ? Math.round(listing.priceBdt / listing.builtUpSqft) : null;

  return (
    <>
      {/* Spec 0016, AC-3: the listing as structured data. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(listingJsonLd(listing, listingHref(listing.slug))) }}
      />
      <nav aria-label="Breadcrumb" className="text-xs text-fg-muted">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href={routes.home} className="hover:text-accent">
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href={discoveryPath} className="hover:text-accent">
              Homes for sale
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-fg">
            {listing.title}
          </li>
        </ol>
      </nav>

      <header className="mt-5 flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <Badge tone="accent">{type} · For sale</Badge>
            <Badge>Ref. {listing.refCode}</Badge>
          </div>
          <h1 className="mt-4 font-display text-4xl text-balance text-fg sm:text-5xl lg:text-6xl">{listing.title}</h1>
          <p className="mt-3 flex items-start gap-1.5 text-fg-muted">
            <MapPin aria-hidden="true" strokeWidth={1.5} className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" />
            {/* The stored address often names the area already. */}
            {listing.addressLine.toLowerCase().includes(listing.area.nameEn.toLowerCase())
              ? listing.addressLine
              : `${listing.addressLine}, ${listing.area.nameEn}`}
          </p>
        </div>
        <div className="sm:text-right">
          <PriceTag priceBdt={listing.priceBdt} negotiable={listing.priceNegotiable} size="lg" className="sm:justify-end" />
          {perSqft ? <p className="mt-1 text-sm text-fg-muted">BDT {perSqft.toLocaleString("en-US")} per sqft</p> : null}
          <div className="mt-4 flex gap-2 sm:justify-end">
            <SaveHomeButton slug={listing.slug} variant="button" />
            <ShareButton title={listing.title} url={absoluteUrl(listingHref(listing.slug))} />
          </div>
        </div>
      </header>

      <Gallery photos={listing.photos.map((photo) => ({ url: photo.url, alt: photo.alt }))} title={listing.title} />

      <div className="mt-12 grid gap-12 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-8">
          <SpecChips listing={listing} className="rounded-2xl border border-line bg-surface-raised p-5 text-base" />

          <Block title="About the residence">
            <p className="leading-relaxed whitespace-pre-line text-fg-muted">{listing.description}</p>
          </Block>

          {listing.amenities.length > 0 ? (
            <Block title="Amenities">
              <ul className="grid gap-3 text-fg sm:grid-cols-2">
                {listing.amenities.map((amenity) => (
                  <li key={amenity.id} className="flex items-center gap-3">
                    <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-full bg-accent-subtle text-accent-subtle-fg">
                      <Check strokeWidth={2} className="h-4 w-4" />
                    </span>
                    {amenity.label}
                  </li>
                ))}
              </ul>
            </Block>
          ) : null}

          <Block title="Specifications">
            <Specifications listing={listing} />
          </Block>

          <Block title="Around the address">
            {listing.latitude !== null && listing.longitude !== null ? (
              // Spec 0013, AC-3: the listing's own pin on a map.
              <ListingMap
                label={`Map showing ${listing.title} in ${listing.area.nameEn}`}
                className="mb-4 h-72"
                markers={[
                  {
                    key: listing.slug,
                    latitude: listing.latitude,
                    longitude: listing.longitude,
                    label: listing.title,
                    title: listing.title,
                  },
                ]}
              />
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface-raised p-5">
              <div>
                <p className="font-medium text-fg">{listing.area.nameEn}</p>
                <p className="mt-1 text-sm text-fg-muted">{listing.addressLine}</p>
              </div>
              {listing.latitude !== null && listing.longitude !== null ? (
                <Button
                  href={`https://www.google.com/maps/search/?api=1&query=${listing.latitude},${listing.longitude}`}
                  intent="secondary"
                  size="sm"
                  target="_blank"
                >
                  <MapPin aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
                  Open in Google Maps
                  <span className="sr-only">(opens in a new tab)</span>
                </Button>
              ) : null}
            </div>
          </Block>
        </div>

        <aside className="lg:col-span-4">
          <div className="rounded-2xl border border-line bg-surface-raised p-6 shadow-soft lg:sticky lg:top-24">
            <Eyebrow>Your advisor</Eyebrow>
            <p className="mt-2 font-display text-2xl text-fg">{advisor}</p>
            <h2 className="mt-6 flex items-center gap-2 font-display text-xl text-fg">
              <CalendarCheck aria-hidden="true" strokeWidth={1.5} className="h-5 w-5 text-secondary" />
              Book a viewing
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Ask the Aurevia Assistant anything about this home, then pick a viewing time in the chat. {advisor === "an Aurevia advisor" ? "An advisor" : advisor}{" "}
              confirms it with you by phone.
            </p>
            <Button href={askHref(listing.slug)} className="mt-6 w-full">
              <Sparkles aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
              Chat about this home
            </Button>
            <p className="mt-3 text-center text-xs text-fg-subtle">In English or বাংলা. You&apos;ll sign in first.</p>
          </div>
        </aside>
      </div>

      {similar.length > 0 ? (
        <section aria-labelledby="similar-heading" className="mt-20 border-t border-line pt-16">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2 id="similar-heading" className="font-display text-4xl text-fg">
              You may also consider
            </h2>
            <Button href={`${discoveryPath}?type=${listing.propertyType.toLowerCase()}`} intent="secondary">
              More {type.toLowerCase()} homes
            </Button>
          </div>
          <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {similar.map((card) => (
              <li key={card.refCode}>
                <PropertyCard
                  listing={card}
                  href={listingHref(card.slug)}
                  className="h-full"
                  save={<SaveHomeButton slug={card.slug} />}
                  footer={<ListingCardLink listing={card} />}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-12 border-t border-line pt-12">
      <h2 className="font-display text-3xl text-fg">{title}</h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function PageSkeleton() {
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">
        Loading home
      </span>
      <Skeleton className="h-4 w-48" />
      <Skeleton className="mt-6 h-14 w-2/3" />
      <Skeleton className="mt-8 aspect-[16/8] w-full rounded-[28px]" />
      <div className="mt-12 grid gap-12 lg:grid-cols-12">
        <Skeleton className="h-96 lg:col-span-8" />
        <Skeleton className="h-72 lg:col-span-4" />
      </div>
    </div>
  );
}

// Only stored fields; a null hides its row (spec 0012).
function Specifications({ listing }: { listing: ListingDTO }) {
  const floor =
    listing.floorNumber !== null
      ? listing.totalFloors !== null
        ? `${listing.floorNumber} of ${listing.totalFloors}`
        : String(listing.floorNumber)
      : listing.totalFloors !== null
        ? `${listing.totalFloors} floors`
        : null;
  const rows: [string, string | null][] = [
    ["Property type", propertyTypeLabels[listing.propertyType]],
    ["Status", listing.completionStatus ? completionLabels[listing.completionStatus] : null],
    ["Handover", listing.handoverDate ? monthYear.format(new Date(listing.handoverDate)) : null],
    ["Floor", floor],
    ["Parking", listing.parkingSpaces !== null ? `${listing.parkingSpaces} ${listing.parkingSpaces === 1 ? "space" : "spaces"}` : null],
    ["Built up area", listing.builtUpSqft !== null ? formatSqft(listing.builtUpSqft) : null],
    ["Land", listing.landKatha !== null ? formatKatha(listing.landKatha) : null],
    ["Reference", listing.refCode],
    ["Listed on", listing.publishedAt ? dhakaDate.format(new Date(listing.publishedAt)) : null],
  ];
  return (
    <dl className="grid overflow-hidden rounded-2xl border border-line bg-surface-raised text-sm sm:grid-cols-2">
      {rows
        .filter((row): row is [string, string] => row[1] !== null)
        .map(([term, value]) => (
          <div key={term} className="flex justify-between gap-4 border-b border-line px-5 py-4 sm:odd:border-r">
            <dt className="text-fg-muted">{term}</dt>
            <dd className="text-right font-medium text-fg">{value}</dd>
          </div>
        ))}
    </dl>
  );
}
