import { ChevronLeft, ChevronRight, LayoutGrid, List, Map as MapIcon, Search, SearchX, Sparkles, X } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { ListingImage } from "@/components/listing/listing-image";
import { PropertyCard } from "@/components/listing/property-card";
import { ListingMap } from "@/components/map/listing-map";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Container, Eyebrow } from "@/components/ui/layout";
import { Radio } from "@/components/ui/radio";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/state";
import { cn } from "@/lib/cn";
import {
  activeFilterCount,
  bedSteps,
  discoveryHref,
  discoveryPageSize,
  discoveryPath,
  formatPriceStep,
  parseDiscoveryQuery,
  priceRangeLabel,
  priceSteps,
  type DiscoveryQuery,
} from "@/lib/domain/discovery";
import { propertyTypeLabels, propertyTypes } from "@/lib/domain/listing-card";
import { pluralize } from "@/lib/format";
import { routes } from "@/lib/nav";
import { discoverListings, discoverMapPins, discoveryOptions, type DiscoveryOptions, type MapPin } from "@/lib/server/discovery";
import { FilterPanel, HiddenQuery, SortSelect } from "./discovery-controls";
import { ListingCardLink, listingHref } from "./listing-href";
import { SaveHomeButton } from "../saved/save-home";

export const metadata: Metadata = {
  title: "Homes for sale in Sylhet",
  description: "Hand checked homes for sale across Sylhet. Filter by area, price, type, and bedrooms, or describe the home to the Aurevia Assistant.",
};

// `/properties` (spec 0010): the public discovery page. It reads no cookies, so
// it stays cacheable (root `AGENTS.md`); the URL holds every filter (AC-3).
export default function PropertiesPage({ searchParams }: PageProps<"/properties">) {
  return (
    <>
      <section className="border-b border-line">
        <Container className="pt-10 pb-8 sm:pt-12">
          <nav aria-label="Breadcrumb" className="text-xs text-fg-muted">
            <Link href={routes.home} className="hover:text-accent">
              Home
            </Link>
            <span aria-hidden="true" className="mx-1.5">
              /
            </span>
            <span aria-current="page" className="text-fg">
              Homes for sale
            </span>
          </nav>
          <Eyebrow className="mt-6">Sylhet · hand checked homes</Eyebrow>
          <h1 className="mt-2 font-display text-4xl text-balance text-fg sm:text-5xl">Residences in Sylhet</h1>
          <Suspense fallback={<Skeleton className="mt-6 h-14 w-full rounded-2xl" />}>
            <Hero searchParams={searchParams} />
          </Suspense>
        </Container>
      </section>
      <Container className="py-10">
        <Suspense fallback={<ResultsSkeleton />}>
          <Discovery searchParams={searchParams} />
        </Suspense>
      </Container>
    </>
  );
}

// Unknown area and amenity slugs are dropped, so they neither filter nor show
// as active (spec 0010, AC-3).
function knownQuery(query: DiscoveryQuery, options: DiscoveryOptions): DiscoveryQuery {
  return {
    ...query,
    areas: query.areas.filter((slug) => options.areas.some((area) => area.slug === slug)),
    amenities: query.amenities.filter((slug) => options.amenities.some((amenity) => amenity.slug === slug)),
  };
}

async function Hero({ searchParams }: Pick<PageProps<"/properties">, "searchParams">) {
  const options = await discoveryOptions();
  const query = knownQuery(parseDiscoveryQuery(await searchParams), options);
  const areasWithHomes = options.areas.filter((area) => area.count > 0).length;
  return (
    <>
      <p className="mt-3 max-w-xl text-fg-muted">
        {pluralize(options.total, "verified home")} across {pluralize(areasWithHomes, "neighbourhood")}. Every listing is checked by
        hand before it goes live.
      </p>
      <Form
        action={discoveryPath}
        role="search"
        className="mt-6 flex flex-col gap-2 rounded-2xl border border-line bg-surface-raised p-2 shadow-soft sm:flex-row"
      >
        <HiddenQuery query={query} omit={["q", "page"]} />
        <label htmlFor="discovery-q" className="sr-only">
          Search by area, title, or reference
        </label>
        <div className="relative flex-1">
          <Search
            aria-hidden="true"
            strokeWidth={1.5}
            className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-fg-subtle"
          />
          <Input
            id="discovery-q"
            name="q"
            type="search"
            defaultValue={query.q}
            maxLength={80}
            placeholder="Tilagor, villa, or AUR-1042"
            className="border-transparent pl-10"
          />
        </div>
        <Button href={routes.assistant} intent="secondary" className="text-secondary">
          <Sparkles aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
          Describe it instead
        </Button>
        <Button type="submit">Search</Button>
      </Form>
    </>
  );
}

async function Discovery({ searchParams }: Pick<PageProps<"/properties">, "searchParams">) {
  const options = await discoveryOptions();
  const query = knownQuery(parseDiscoveryQuery(await searchParams), options);
  const active = activeFilterCount(query);
  const map = query.view === "map" ? await discoverMapPins(query) : null;
  const { items, total } = map ? { items: [], total: map.total } : await discoverListings(query);
  const pages = Math.max(1, Math.ceil(total / discoveryPageSize));
  const firstShown = (query.page - 1) * discoveryPageSize + 1;

  return (
    <div className="grid gap-10 lg:grid-cols-12">
      <aside className="lg:col-span-3">
        <FilterPanel activeCount={active}>
          <FilterForm query={query} options={options} />
        </FilterPanel>
      </aside>

      <section aria-labelledby="results-heading" className="min-w-0 lg:col-span-9">
        <h2 id="results-heading" className="sr-only">
          Search results
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-fg-muted" aria-live="polite">
            <span className="font-medium text-fg">{pluralize(total, "home")}</span>{" "}
            {active === 0 ? "for sale" : total === 1 ? "matches your search" : "match your search"}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <SortSelect query={query} />
            <nav aria-label="Layout" className="flex rounded-full border border-line bg-surface-raised p-1">
              {(["grid", "list", "map"] as const).map((view) => {
                const Icon = viewIcons[view];
                const current = query.view === view;
                return (
                  <Link
                    key={view}
                    href={discoveryHref(query, { view, page: view === "map" || query.view === "map" ? 1 : query.page })}
                    aria-label={viewLabels[view]}
                    aria-current={current ? "true" : undefined}
                    className={cn(
                      "grid h-8 w-8 place-items-center rounded-full transition-colors duration-fast",
                      current ? "bg-fg text-surface" : "text-fg-muted hover:bg-surface-sunken",
                    )}
                  >
                    <Icon aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        <ActiveChips query={query} options={options} />

        {map ? (
          map.pins.length === 0 ? (
            <EmptyResults query={query} total={0} active={active} />
          ) : (
            <MapResults pins={map.pins} total={map.total} />
          )
        ) : items.length === 0 ? (
          <EmptyResults query={query} total={total} active={active} />
        ) : (
          <ul className={cn("mt-8 grid gap-6", query.view === "grid" ? "sm:grid-cols-2 xl:grid-cols-3" : "grid-cols-1")}>
            {items.map((listing) => (
              <li key={listing.refCode}>
                <PropertyCard
                  listing={listing}
                  layout={query.view === "list" ? "list" : "grid"}
                  href={listingHref(listing.slug)}
                  className="h-full"
                  save={<SaveHomeButton slug={listing.slug} />}
                  footer={<ListingCardLink listing={listing} />}
                />
              </li>
            ))}
          </ul>
        )}

        {total > 0 && items.length > 0 ? (
          <Pagination query={query} pages={pages} summary={`Showing ${firstShown} to ${firstShown + items.length - 1} of ${total}`} />
        ) : null}
      </section>
    </div>
  );
}

const viewIcons = { grid: LayoutGrid, list: List, map: MapIcon } as const;
const viewLabels = { grid: "Grid view", list: "List view", map: "Map view" } as const;

// Spec 0013: every match as a price pin; the same homes are listed as links
// below, so the results never depend on the map alone.
function MapResults({ pins, total }: { pins: MapPin[]; total: number }) {
  return (
    <div className="mt-8">
      <ListingMap
        label="Map of matching homes"
        className="h-[60vh] min-h-[420px]"
        markers={pins.map((pin) => ({
          key: pin.slug,
          latitude: pin.latitude,
          longitude: pin.longitude,
          label: formatPriceStep(pin.priceBdt),
          title: `${pin.title}, ${formatPriceStep(pin.priceBdt)}`,
          popup: (
            <Link href={listingHref(pin.slug)} className="block w-52 text-fg">
              <ListingImage src={pin.cover?.url ?? null} alt="" className="aspect-[4/3] rounded-lg" />
              <span className="mt-2 block font-medium">{pin.title}</span>
              <span className="block text-xs text-fg-muted">{pin.areaName}</span>
              <span className="mt-1 block font-display text-base text-accent">{formatPriceStep(pin.priceBdt)}</span>
            </Link>
          ),
        }))}
      />
      {total > pins.length ? (
        <p className="mt-3 text-xs text-fg-subtle">The map shows the first {pins.length}. Narrow your filters to see the rest.</p>
      ) : null}
      <ul aria-label="Homes on the map" className="mt-6 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {pins.map((pin) => (
          <li key={pin.slug} className="flex justify-between gap-3 border-b border-line py-2">
            <Link href={listingHref(pin.slug)} className="truncate text-fg hover:text-accent">
              {pin.title}
              <span className="text-fg-muted"> · {pin.areaName}</span>
            </Link>
            <span className="shrink-0 text-fg-muted tabular-nums">{formatPriceStep(pin.priceBdt)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FilterForm({ query, options }: { query: DiscoveryQuery; options: DiscoveryOptions }) {
  const legend = "text-xs font-medium tracking-wide text-fg-subtle uppercase";
  return (
    <Form action={discoveryPath} className="divide-y divide-line text-sm">
      <HiddenQuery query={query} omit={["areas", "types", "min", "max", "beds", "amenities", "page"]} />

      <fieldset className="px-6 py-5">
        <legend className={legend}>Location</legend>
        <div className="mt-3 flex flex-col gap-2.5">
          {options.areas.map((area) => (
            <div key={area.slug} className="flex items-center justify-between gap-3">
              <Checkbox
                id={`area-${area.slug}`}
                name="area"
                value={area.slug}
                defaultChecked={query.areas.includes(area.slug)}
                label={area.name}
              />
              <span className="text-xs text-fg-subtle tabular-nums" aria-hidden="true">
                {area.count}
              </span>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="px-6 py-5">
        <legend className={legend}>Price</legend>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-fg-muted">Min</span>
            <Select name="min" defaultValue={query.min ?? ""}>
              <option value="">No min</option>
              {withCurrent(priceSteps, query.min).map((step) => (
                <option key={step} value={step}>
                  {formatPriceStep(step)}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-fg-muted">Max</span>
            <Select name="max" defaultValue={query.max ?? ""}>
              <option value="">No max</option>
              {withCurrent(priceSteps, query.max).map((step) => (
                <option key={step} value={step}>
                  {formatPriceStep(step)}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </fieldset>

      <fieldset className="px-6 py-5">
        <legend className={legend}>Bedrooms</legend>
        <div className="mt-3 grid grid-cols-3 gap-2.5">
          <Radio id="beds-any" name="beds" value="" defaultChecked={query.beds === null} label="Any" />
          {bedSteps.map((beds) => (
            <Radio key={beds} id={`beds-${beds}`} name="beds" value={beds} defaultChecked={query.beds === beds} label={`${beds}+`} />
          ))}
        </div>
      </fieldset>

      <fieldset className="px-6 py-5">
        <legend className={legend}>Property type</legend>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {propertyTypes.map((type) => (
            <Checkbox
              key={type}
              id={`type-${type}`}
              name="type"
              value={type.toLowerCase()}
              defaultChecked={query.types.includes(type)}
              label={propertyTypeLabels[type]}
            />
          ))}
        </div>
      </fieldset>

      {options.amenities.length > 0 ? (
        <fieldset className="px-6 py-5">
          <legend className={legend}>Amenities</legend>
          <div className="mt-3 flex flex-col gap-2.5">
            {options.amenities.map((amenity) => (
              <Checkbox
                key={amenity.slug}
                id={`amenity-${amenity.slug}`}
                name="amenity"
                value={amenity.slug}
                defaultChecked={query.amenities.includes(amenity.slug)}
                label={amenity.label}
              />
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="flex gap-2 px-6 py-5">
        <Button href={clearedHref(query)} intent="secondary" className="flex-1">
          Reset
        </Button>
        <Button type="submit" className="flex-1">
          Show homes
        </Button>
      </div>
    </Form>
  );
}

// A price from a shared URL that isn't a preset step still shows as selected.
function withCurrent(steps: number[], current: number | null) {
  return current === null || steps.includes(current) ? steps : [...steps, current].sort((a, b) => a - b);
}

const clearedHref = (query: DiscoveryQuery) =>
  discoveryHref(query, { q: "", areas: [], types: [], min: null, max: null, beds: null, amenities: [] });

function ActiveChips({ query, options }: { query: DiscoveryQuery; options: DiscoveryOptions }) {
  const chips: { key: string; label: string; href: string }[] = [];
  if (query.q) chips.push({ key: "q", label: `“${query.q}”`, href: discoveryHref(query, { q: "" }) });
  for (const slug of query.areas) {
    const area = options.areas.find((row) => row.slug === slug);
    if (area) chips.push({ key: `area-${slug}`, label: area.name, href: discoveryHref(query, { areas: query.areas.filter((s) => s !== slug) }) });
  }
  if (query.min !== null || query.max !== null) {
    chips.push({ key: "price", label: priceRangeLabel(query.min, query.max), href: discoveryHref(query, { min: null, max: null }) });
  }
  if (query.beds !== null) chips.push({ key: "beds", label: `${query.beds}+ beds`, href: discoveryHref(query, { beds: null }) });
  for (const type of query.types) {
    chips.push({ key: `type-${type}`, label: propertyTypeLabels[type], href: discoveryHref(query, { types: query.types.filter((t) => t !== type) }) });
  }
  for (const slug of query.amenities) {
    const amenity = options.amenities.find((row) => row.slug === slug);
    if (amenity) {
      chips.push({
        key: `amenity-${slug}`,
        label: amenity.label,
        href: discoveryHref(query, { amenities: query.amenities.filter((s) => s !== slug) }),
      });
    }
  }
  if (chips.length === 0) return null;

  return (
    <ul aria-label="Active filters" className="mt-4 flex flex-wrap items-center gap-2 text-sm">
      {chips.map((chip) => (
        <li key={chip.key}>
          <Link
            href={chip.href}
            className="inline-flex items-center gap-2 rounded-full bg-accent-subtle px-3.5 py-1.5 text-accent-subtle-fg transition-colors duration-fast hover:bg-surface-sunken"
          >
            {chip.label}
            <X aria-hidden="true" strokeWidth={1.5} className="h-3.5 w-3.5" />
            <span className="sr-only">, remove this filter</span>
          </Link>
        </li>
      ))}
      <li>
        <Link href={clearedHref(query)} className="px-2 text-fg-muted underline underline-offset-4 hover:text-accent">
          Clear all
        </Link>
      </li>
    </ul>
  );
}

function EmptyResults({ query, total, active }: { query: DiscoveryQuery; total: number; active: number }) {
  if (total > 0) {
    return (
      <EmptyState
        className="mt-8"
        title="This page is empty"
        body="There are fewer homes than this page number."
        action={
          <Button href={discoveryHref(query, { page: 1 })} intent="secondary">
            Back to page 1
          </Button>
        }
      />
    );
  }
  return (
    <EmptyState
      className="mt-8"
      icon={SearchX}
      title={active > 0 ? "No homes match" : "No homes listed yet"}
      body={
        active > 0
          ? "Try fewer filters, or tell the assistant what your family needs and it will look for close matches."
          : "Our agents are checking new homes. Tell the assistant what you need in the meantime."
      }
      action={
        <div className="flex flex-wrap justify-center gap-3">
          {active > 0 ? (
            <Button href={clearedHref(query)} intent="secondary">
              Clear filters
            </Button>
          ) : null}
          <Button href={routes.assistant}>
            <Sparkles aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
            Describe it to the assistant
          </Button>
        </div>
      }
    />
  );
}

// 1 … 4 5 6 … 12
function pageWindow(current: number, pages: number): (number | "gap")[] {
  const shown = [...new Set([1, current - 1, current, current + 1, pages])].filter((page) => page >= 1 && page <= pages).sort((a, b) => a - b);
  return shown.flatMap((page, index) => (index > 0 && page - shown[index - 1] > 1 ? ["gap" as const, page] : [page]));
}

function Pagination({ query, pages, summary }: { query: DiscoveryQuery; pages: number; summary: string }) {
  return (
    <nav aria-label="Pages" className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6 text-sm">
      <p className="text-fg-muted">{summary}</p>
      {pages > 1 ? (
        <ul className="flex items-center gap-1">
          {query.page > 1 ? (
            <li>
              <Button href={discoveryHref(query, { page: query.page - 1 })} intent="ghost" size="sm" aria-label="Previous page">
                <ChevronLeft aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
              </Button>
            </li>
          ) : null}
          {pageWindow(query.page, pages).map((page, index) =>
            page === "gap" ? (
              <li key={`gap-${index}`} aria-hidden="true" className="px-1 text-fg-subtle">
                …
              </li>
            ) : (
              <li key={page}>
                <Link
                  href={discoveryHref(query, { page })}
                  aria-current={page === query.page ? "page" : undefined}
                  aria-label={`Page ${page}`}
                  className={cn(
                    "grid h-10 w-10 place-items-center rounded-full tabular-nums transition-colors duration-fast",
                    page === query.page ? "bg-fg font-medium text-surface" : "text-fg-muted hover:bg-surface-raised",
                  )}
                >
                  {page}
                </Link>
              </li>
            ),
          )}
          {query.page < pages ? (
            <li>
              <Button href={discoveryHref(query, { page: query.page + 1 })} intent="secondary" size="sm" className="ml-2">
                Next
                <ChevronRight aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
              </Button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </nav>
  );
}

function ResultsSkeleton() {
  return (
    <div className="grid gap-10 lg:grid-cols-12" aria-busy="true">
      <span className="sr-only" role="status">
        Loading homes
      </span>
      <Skeleton className="h-96 w-full lg:col-span-3" />
      <div className="grid gap-6 sm:grid-cols-2 lg:col-span-9 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="aspect-[3/4] w-full" />
        ))}
      </div>
    </div>
  );
}
