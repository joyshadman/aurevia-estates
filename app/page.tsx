import { ArrowRight, Bot, CalendarCheck, Languages, MessageCircle, Search, ShieldCheck, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ListingImage } from "@/components/listing/listing-image";
import { PropertyCard } from "@/components/listing/property-card";
import { Button } from "@/components/ui/button";
import { Container, Eyebrow } from "@/components/ui/layout";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { bedSteps, discoveryPath, formatPriceStep, priceSteps } from "@/lib/domain/discovery";
import { propertyTypeLabels, propertyTypes, type ListingCardDTO, type PropertyType } from "@/lib/domain/listing-card";
import { formatPrice } from "@/lib/format";
import { isOptimizableImage } from "@/lib/images";
import { routes } from "@/lib/nav";
import { agencyJsonLd, jsonLdHtml } from "@/lib/seo";
import { discoveryOptions } from "@/lib/server/discovery";
import { homepageData, type HomepageCategory } from "@/lib/server/homepage";
import { askAboutHref, ListingCardLink, listingHref } from "./properties/listing-href";
import { SaveHomeButton } from "./saved/save-home";

export const metadata: Metadata = {
  title: { absolute: "Aurevia Estates · Hand checked homes in Sylhet" },
  description:
    "Hand checked homes for sale across Sylhet. Describe the home you want in English or বাংলা and the Aurevia Assistant finds real, verified listings.",
};

const typePlurals: Record<PropertyType, string> = {
  APARTMENT: "Apartments",
  DUPLEX: "Duplexes",
  VILLA: "Villas",
  HOUSE: "Houses",
  PLOT: "Plots",
  COMMERCIAL: "Commercial spaces",
};

const promptChips = [
  { text: "Which areas suit a family with school age kids?" },
  { text: "Villas with a garden under 5 crore" },
  { text: "জিন্দাবাজারে ৩ বেডরুমের ফ্ল্যাট আছে?", lang: "bn" },
];

const askHref = (listing: ListingCardDTO) => askAboutHref(listing.slug);
const assistantHref = (q: string) => `${routes.assistant}?${new URLSearchParams({ q })}`;

// The homepage (spec 0011). Public and cached: it reads no cookies (AC-5), and
// every listing and number on it is live (AC-1, AC-4). Sections follow the
// mockup, without testimonials or claims the agency hasn't confirmed.
export default async function HomePage() {
  const [data, options] = await Promise.all([homepageData(), discoveryOptions()]);
  const [hero, example, ctaListing] = [data.newest[0], data.newest[1] ?? data.newest[0], data.newest[2] ?? data.newest[0]];
  const hasHomes = data.newest.length > 0;

  return (
    <>
      {/* Spec 0016: the agency as structured data. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(agencyJsonLd()) }} />
      <Container className="pt-6">
        <Hero listing={hero} />
        <SearchPanel areas={options.areas} />
      </Container>

      {hasHomes ? <Newest listings={data.newest} /> : null}
      <AssistantPromo example={example} />
      {data.categories.length > 0 ? <Categories categories={data.categories} /> : null}
      <WhyAurevia stats={hasHomes ? data.stats : null} />
      <AdvisorCta listing={ctaListing} />
    </>
  );
}

function Hero({ listing }: { listing: ListingCardDTO | undefined }) {
  const cover = listing?.cover;
  return (
    <section aria-labelledby="hero-heading" className="relative overflow-hidden rounded-[28px] bg-feature">
      {cover ? (
        <Image
          src={cover.url}
          alt={cover.alt || listing.title}
          fill
          loading="eager"
          fetchPriority="high"
          sizes="(min-width: 1280px) 1216px, 100vw"
          unoptimized={!isOptimizableImage(cover.url)}
          className="object-cover"
        />
      ) : null}
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-media-scrim via-media-scrim/60 to-transparent" />
      <div className="relative grid min-h-[520px] items-end gap-10 px-6 pt-20 pb-28 sm:px-12 lg:min-h-[600px] lg:grid-cols-12 lg:pb-32">
        <div className="lg:col-span-7">
          <p className="text-xs tracking-[.18em] text-on-media-muted uppercase">Private residences · Sylhet Division</p>
          <h1 id="hero-heading" className="mt-5 font-display text-4xl leading-[1.08] text-balance text-on-media sm:text-6xl lg:text-7xl">
            Homes framed by <em className="font-normal text-on-media-accent italic">tea hills</em> and quiet light.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-on-media-muted sm:text-lg">
            From hillside villas in Tilagor to apartments above Zindabazar, every Aurevia home is visited and checked by hand
            before it goes live.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button href={discoveryPath} size="lg">
              Explore residences
              <ArrowRight aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
            </Button>
            <Link
              href={routes.assistant}
              className="inline-flex h-12 items-center gap-2 rounded-full border border-media-line px-6 text-base font-medium text-on-media transition-colors duration-fast hover:bg-media-glass"
            >
              <Sparkles aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
              Ask the Aurevia Assistant
            </Link>
          </div>
        </div>
        {listing ? (
          <Link
            href={listingHref(listing.slug)}
            className="hidden rounded-2xl border border-media-line bg-media-scrim p-5 text-on-media backdrop-blur-md transition-colors duration-fast hover:border-on-media-muted lg:col-span-4 lg:col-start-9 lg:block"
          >
            <span className="block text-[11px] tracking-[.18em] text-on-media-muted uppercase">Newest on Aurevia</span>
            <span className="mt-2 block font-display text-2xl">{listing.title}</span>
            <span className="mt-1 block text-sm text-on-media-muted">
              {listing.areaName} · {propertyTypeLabels[listing.propertyType]}
              {listing.bedrooms !== null ? ` · ${listing.bedrooms} bedrooms` : ""}
            </span>
            <span className="mt-4 flex items-center justify-between border-t border-media-line pt-4">
              <span className="font-display text-xl">{formatPrice(listing.priceBdt)}</span>
              <span className="flex items-center gap-1 text-xs text-on-media-muted">
                View residence <ArrowRight aria-hidden="true" strokeWidth={1.5} className="h-3.5 w-3.5" />
              </span>
            </span>
          </Link>
        ) : null}
      </div>
    </section>
  );
}

// AC-3: a GET form to the discovery page, with spec 0010's params.
function SearchPanel({ areas }: { areas: { slug: string; name: string; count: number }[] }) {
  const field = "flex flex-col gap-1 px-4 py-3";
  const label = "text-[11px] tracking-wide text-fg-subtle uppercase";
  return (
    <Form
      action={discoveryPath}
      aria-label="Search homes"
      className="relative z-10 mx-auto -mt-16 max-w-6xl rounded-2xl border border-line bg-surface-raised p-3 shadow-lift sm:p-4"
    >
      <div className="grid grid-cols-1 divide-y divide-line rounded-xl border border-line sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto] lg:divide-x">
        <label className={field}>
          <span className={label}>Location</span>
          <Select name="area" defaultValue="" className="h-10 border-transparent px-0">
            <option value="">Any area</option>
            {areas.map((area) => (
              <option key={area.slug} value={area.slug}>
                {area.name}
              </option>
            ))}
          </Select>
        </label>
        <label className={cn(field, "sm:border-l sm:border-line lg:border-l-0")}>
          <span className={label}>Property type</span>
          <Select name="type" defaultValue="" className="h-10 border-transparent px-0">
            <option value="">Any type</option>
            {propertyTypes.map((type) => (
              <option key={type} value={type.toLowerCase()}>
                {propertyTypeLabels[type]}
              </option>
            ))}
          </Select>
        </label>
        <label className={field}>
          <span className={label}>Max budget</span>
          <Select name="max" defaultValue="" className="h-10 border-transparent px-0">
            <option value="">No limit</option>
            {priceSteps.map((step) => (
              <option key={step} value={step}>
                Up to {formatPriceStep(step)}
              </option>
            ))}
          </Select>
        </label>
        <label className={cn(field, "sm:border-l sm:border-line lg:border-l-0")}>
          <span className={label}>Bedrooms</span>
          <Select name="beds" defaultValue="" className="h-10 border-transparent px-0">
            <option value="">Any</option>
            {bedSteps.map((beds) => (
              <option key={beds} value={beds}>
                {beds}+ bedrooms
              </option>
            ))}
          </Select>
        </label>
        <div className="p-2 sm:col-span-2 lg:col-span-1">
          <Button type="submit" className="h-full min-h-12 w-full rounded-lg">
            <Search aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
            Search
          </Button>
        </div>
      </div>
    </Form>
  );
}

function SectionHeading({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <div className="max-w-2xl">
        <Eyebrow className="text-accent">{eyebrow}</Eyebrow>
        <h2 id={id} className="mt-3 font-display text-4xl text-balance text-fg sm:text-5xl">
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

// "Selected this season": the newest published homes until paid featuring (feature 25).
function Newest({ listings }: { listings: ListingCardDTO[] }) {
  return (
    <section aria-labelledby="newest-heading">
      <Container className="py-20 sm:py-24">
        <SectionHeading id="newest-heading" eyebrow="Newest residences" title="Selected this season">
          <Button href={discoveryPath} intent="secondary">
            View all homes
            <ArrowRight aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
          </Button>
        </SectionHeading>
        <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <li key={listing.refCode}>
              <PropertyCard
                listing={listing}
                href={listingHref(listing.slug)}
                className="h-full"
                save={<SaveHomeButton slug={listing.slug} />}
                footer={<ListingCardLink listing={listing} />}
              />
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

// AC-2: the describe box hands its text to the assistant (spec 0006's `q`);
// sign in keeps it in `next`.
function AssistantPromo({ example }: { example: ListingCardDTO | undefined }) {
  return (
    <section aria-labelledby="promo-heading" className="bg-feature text-on-media">
      <Container className="grid gap-14 py-20 sm:py-24 lg:grid-cols-2 lg:items-center">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 rounded-full border border-media-line px-3 py-1 text-xs tracking-[.18em] text-on-media-muted uppercase">
            <Sparkles aria-hidden="true" strokeWidth={1.5} className="h-3.5 w-3.5" />
            Aurevia Assistant
          </p>
          <h2 id="promo-heading" className="mt-6 font-display text-4xl leading-tight text-balance sm:text-5xl">
            Describe the home. <em className="text-on-media-accent italic">We&apos;ll find the address.</em>
          </h2>
          <p className="mt-5 max-w-lg leading-relaxed text-on-media-muted">
            Tell the assistant your budget, neighbourhood, and how your family lives, in English or{" "}
            <span lang="bn">বাংলা</span>. It searches only verified Aurevia listings and books a viewing with an advisor.
          </p>
          <Form
            action={routes.assistant}
            className="mt-9 flex items-center gap-2 rounded-full border border-media-line bg-media-glass p-1.5 pl-5"
          >
            <label htmlFor="promo-q" className="sr-only">
              Describe the home you want
            </label>
            <input
              id="promo-q"
              name="q"
              type="text"
              required
              maxLength={500}
              placeholder="A 4 bedroom home near Uposhohor under 2 crore"
              className="min-w-0 flex-1 bg-transparent py-2 text-sm text-on-media placeholder:text-on-media-muted focus:outline-none"
            />
            <button
              type="submit"
              className="shrink-0 rounded-full bg-on-media px-5 py-2.5 text-sm font-medium text-feature transition-colors duration-fast hover:bg-on-media-accent"
            >
              Ask
            </button>
          </Form>
          <ul className="mt-5 flex flex-wrap gap-2 text-sm">
            {promptChips.map((chip) => (
              <li key={chip.text}>
                <Link
                  href={assistantHref(chip.text)}
                  lang={chip.lang}
                  className="inline-block rounded-full border border-media-line px-4 py-2 text-on-media-muted transition-colors duration-fast hover:bg-media-glass hover:text-on-media"
                >
                  {chip.text}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {example ? <ExampleChat listing={example} /> : null}
      </Container>
    </section>
  );
}

function ExampleChat({ listing }: { listing: ListingCardDTO }) {
  return (
    <figure className="min-w-0 rounded-3xl bg-surface p-5 text-fg shadow-lift sm:p-7">
      <div className="flex items-center justify-between border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-full bg-accent text-on-accent">
            <Bot strokeWidth={1.5} className="h-4 w-4" />
          </span>
          <p className="text-sm font-medium">Aurevia Assistant</p>
        </div>
        <span className="rounded-full border border-line px-2.5 py-1 text-[11px] text-fg-muted">Example</span>
      </div>
      <div className="flex flex-col gap-4 py-5 text-sm">
        <p className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-accent px-4 py-3 text-on-accent">
          We&apos;re a family of five looking for a home in Sylhet with parking.
        </p>
        <p className="max-w-[85%] rounded-2xl rounded-bl-md border border-line bg-surface-raised px-4 py-3 leading-relaxed">
          Here&apos;s a verified home that could fit. Want me to book a viewing?
        </p>
        <Link
          href={askHref(listing)}
          className="flex items-center gap-3 rounded-xl border border-line bg-surface-raised p-2.5 transition-colors duration-fast hover:border-accent"
        >
          <ListingImage src={listing.cover?.url ?? null} alt="" className="h-14 w-20 shrink-0 rounded-lg" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{listing.title}</span>
            <span className="block text-xs text-fg-muted">
              {listing.areaName} · {propertyTypeLabels[listing.propertyType]}
            </span>
          </span>
          <span className="font-display text-base whitespace-nowrap">{formatPriceStep(listing.priceBdt)}</span>
        </Link>
      </div>
      <figcaption className="sr-only">An example conversation with the assistant, showing a real listing.</figcaption>
      <Button href={routes.assistant} className="w-full">
        Start your own conversation
        <ArrowRight aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
      </Button>
    </figure>
  );
}

function Categories({ categories }: { categories: HomepageCategory[] }) {
  return (
    <section aria-labelledby="categories-heading">
      <Container className="py-20 sm:py-24">
        <SectionHeading id="categories-heading" eyebrow="Browse by residence" title="Ways to live in Sylhet" />
        <ul className={cn("mt-12 grid gap-5 sm:grid-cols-2", categories.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
          {categories.map((category) => (
            <li key={category.type}>
              <Link
                href={`${discoveryPath}?type=${category.type.toLowerCase()}`}
                className="group relative block aspect-[3/4] overflow-hidden rounded-2xl"
              >
                <ListingImage src={category.cover?.url ?? null} alt="" className="absolute inset-0" />
                <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-media-scrim via-transparent to-transparent" />
                <span className="absolute inset-x-0 bottom-0 p-6 text-on-media">
                  <span className="block text-xs text-on-media-muted">
                    {category.count} {category.count === 1 ? "listing" : "listings"} · from {formatPriceStep(category.fromBdt)}
                  </span>
                  <span className="mt-1 flex items-center justify-between font-display text-2xl">
                    {typePlurals[category.type]}
                    <ArrowRight
                      aria-hidden="true"
                      strokeWidth={1.5}
                      className="h-5 w-5 opacity-0 transition-opacity duration-base group-hover:opacity-100"
                    />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

// Only what the product does today (spec 0011, AC-4).
const reasons = [
  {
    icon: ShieldCheck,
    title: "Checked by hand",
    body: "An Aurevia agent prepares and checks every listing before it goes live. Nothing is scraped or posted unseen.",
  },
  {
    icon: Languages,
    title: "English or বাংলা",
    body: "Describe the home in the language you think in. The assistant replies in kind and shows only real listings.",
  },
  {
    icon: CalendarCheck,
    title: "Viewings with an advisor",
    body: "Pick a time in the chat. An advisor confirms it with you by phone, and you see every change in your account.",
  },
  {
    icon: MessageCircle,
    title: "For families abroad",
    body: "Search from London or Dubai at any hour, and ask for WhatsApp follow up when you book.",
  },
];

function WhyAurevia({ stats }: { stats: { homes: number; neighbourhoods: number; fromBdt: number | null } | null }) {
  return (
    <section aria-labelledby="why-heading" className="border-y border-line bg-surface-raised">
      <Container className="grid gap-14 py-20 sm:py-24 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Eyebrow className="text-accent">Why Aurevia</Eyebrow>
          <h2 id="why-heading" className="mt-3 font-display text-4xl leading-tight text-balance text-fg sm:text-5xl">
            Fewer listings. Every one of them checked by hand.
          </h2>
          <p className="mt-6 max-w-md leading-relaxed text-fg-muted">
            We would rather show you ten homes we know than a thousand we don&apos;t. The assistant only ever recommends homes
            our agents have published.
          </p>
        </div>
        <ul className="grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:col-span-7">
          {reasons.map(({ icon: Icon, title, body }) => (
            <li key={title} className="border-t border-fg pt-5">
              <Icon aria-hidden="true" strokeWidth={1.5} className="h-5 w-5 text-secondary" />
              <h3 className="mt-3 font-display text-xl text-fg">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">{body}</p>
            </li>
          ))}
        </ul>
      </Container>
      {stats ? (
        <div className="border-t border-line">
          <dl className="mx-auto grid max-w-7xl grid-cols-2 gap-px bg-line lg:grid-cols-4">
            {[
              ["Verified homes", stats.homes.toLocaleString("en-US")],
              ["Neighbourhoods", stats.neighbourhoods.toLocaleString("en-US")],
              ["Homes from", stats.fromBdt === null ? "" : formatPriceStep(stats.fromBdt)],
              ["Languages", "English · বাংলা"],
            ].map(([term, value]) => (
              <div key={term} className="flex flex-col-reverse bg-surface-raised px-5 py-10 lg:px-8">
                <dd className="mt-2 font-display text-3xl text-accent sm:text-4xl">{value}</dd>
                <dt className="text-xs tracking-wide text-fg-subtle uppercase">{term}</dt>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </section>
  );
}

// "Talk to an advisor" stands in for the deferred private valuation.
function AdvisorCta({ listing }: { listing: ListingCardDTO | undefined }) {
  return (
    <section aria-labelledby="cta-heading">
      <Container className="py-20 sm:py-24">
        <div className="grid overflow-hidden rounded-[28px] bg-accent text-on-accent lg:grid-cols-2">
          <div className="p-10 sm:p-14">
            <p className="text-xs tracking-[.18em] uppercase opacity-80">Buying from Sylhet or abroad</p>
            <h2 id="cta-heading" className="mt-4 font-display text-4xl leading-tight text-balance sm:text-5xl">
              Talk to an advisor.
            </h2>
            <p className="mt-5 max-w-md leading-relaxed opacity-90">
              Tell the assistant what you need and pick a viewing time. An Aurevia advisor calls to confirm it and walks you
              through the home.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href={routes.assistant}
                className="inline-flex h-12 items-center gap-2 rounded-full bg-surface-raised px-6 font-medium text-accent transition-colors duration-fast hover:bg-surface"
              >
                <Sparkles aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
                Start with the assistant
              </Link>
              <Link
                href={discoveryPath}
                className="inline-flex h-12 items-center gap-2 rounded-full border border-current px-6 font-medium transition-opacity duration-fast hover:opacity-80"
              >
                Browse homes
              </Link>
            </div>
          </div>
          <div className="relative min-h-[280px] bg-feature">
            {listing?.cover ? <ListingImage src={listing.cover.url} alt="" className="absolute inset-0" /> : null}
          </div>
        </div>
      </Container>
    </section>
  );
}
