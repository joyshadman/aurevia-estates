import { ArrowRight, Check, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { DescribeBox } from "@/components/home/describe-box";
import { QuickSearch } from "@/components/home/quick-search";
import { JsonLd } from "@/components/seo/json-ld";
import { ListingImage } from "@/components/listing/listing-image";
import { PriceTag } from "@/components/listing/price-tag";
import { PropertyCard } from "@/components/listing/property-card";
import { SpecChips } from "@/components/listing/spec-chips";
import { Button } from "@/components/ui/button";
import { Container, Eyebrow, Section } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { homeCopy } from "@/lib/content/home";
import { propertyTypeLabels } from "@/lib/domain/listing-card";
import { organizationJsonLd } from "@/lib/domain/structured-data";
import { formatPrice } from "@/lib/format";
import { homeData } from "@/lib/server/home";
import { searchRefs } from "@/lib/server/public-search";
import { siteUrl } from "@/lib/server/sign-in";

// The homepage (spec 0012, assumed). The copy prerenders; live listings stream
// in after `connection()`, so the build never needs the database.

export const metadata: Metadata = {
  title: { absolute: "Aurevia Estates · Hand checked homes in Sylhet" },
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return (
    <>
      <JsonLd data={organizationJsonLd(siteUrl())} />
      <Container className="grid gap-10 py-14 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-center lg:py-20">
        <div className="flex flex-col items-start gap-6">
          <Eyebrow>{homeCopy.eyebrow}</Eyebrow>
          <h1 className="max-w-2xl font-display text-5xl leading-[1.05] text-fg sm:text-6xl">{homeCopy.headline}</h1>
          <p className="max-w-xl text-lg text-fg-muted">{homeCopy.lead}</p>
          <div className="flex flex-wrap gap-3">
            <Button href="/properties" size="lg">
              Explore homes
            </Button>
            <Button href="/assistant" size="lg" intent="secondary">
              <Sparkles aria-hidden="true" className="h-5 w-5" />
              Ask the Aurevia Assistant
            </Button>
          </div>
        </div>
        <Suspense fallback={<Skeleton className="aspect-[4/5] rounded-[28px]" />}>
          <FeaturedCard />
        </Suspense>
      </Container>

      <Container className="-mt-4 pb-6">
        <Suspense fallback={<Skeleton className="h-28 rounded-2xl" />}>
          <QuickSearchSection />
        </Suspense>
      </Container>

      <Suspense fallback={null}>
        <LiveSections />
      </Suspense>

      <Section tone="accent" aria-labelledby="assistant-promo">
        <Container className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <div className="flex flex-col gap-4">
            <Eyebrow className="text-current opacity-80">Aurevia Assistant</Eyebrow>
            <h2 id="assistant-promo" className="font-display text-4xl">
              {homeCopy.assistantTitle}
            </h2>
            <p className="max-w-xl opacity-90">{homeCopy.assistantLead}</p>
          </div>
          <div className="rounded-2xl bg-surface-raised p-6 text-fg shadow-lift">
            <DescribeBox examples={homeCopy.examples} />
          </div>
        </Container>
      </Section>

      <Section aria-labelledby="why-aurevia">
        <Container className="grid gap-10 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <div className="flex flex-col gap-3">
            <Eyebrow>Why Aurevia</Eyebrow>
            <h2 id="why-aurevia" className="font-display text-3xl text-fg">
              {homeCopy.whyTitle}
            </h2>
          </div>
          <ul className="grid gap-6 sm:grid-cols-2">
            {homeCopy.why.map((point) => (
              <li key={point.title} className="flex gap-3">
                <Check aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-accent" />
                <div>
                  <h3 className="font-medium text-fg">{point.title}</h3>
                  <p className="mt-1 text-sm text-fg-muted">{point.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </Container>
      </Section>
    </>
  );
}

async function FeaturedCard() {
  await connection();
  const { newest } = await homeData();
  const home = newest[0];
  if (!home) return null;
  return (
    <article className="relative overflow-hidden rounded-[28px] bg-surface-raised shadow-lift">
      <ListingImage src={home.cover?.url ?? null} alt={home.cover?.alt ?? home.title} priority className="aspect-[4/3]" />
      <div className="flex flex-col gap-2 p-6">
        <Eyebrow>Featured this month</Eyebrow>
        <h2 className="font-display text-2xl text-fg">
          <Link href={`/properties/${home.slug}`} className="after:absolute after:inset-0 after:content-[''] hover:text-accent">
            {home.title}
          </Link>
        </h2>
        <SpecChips listing={home} />
        <div className="flex items-center justify-between gap-3">
          <PriceTag priceBdt={home.priceBdt} negotiable={home.priceNegotiable} />
          <span aria-hidden="true" className="inline-flex items-center gap-1 text-sm text-accent">
            View home <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </article>
  );
}

async function QuickSearchSection() {
  await connection();
  const refs = await searchRefs();
  return <QuickSearch areas={refs.areas.map((a) => ({ slug: a.slug, nameEn: a.nameEn }))} />;
}

async function LiveSections() {
  await connection();
  const { newest, total, types } = await homeData();
  if (total === 0) return null;
  return (
    <>
      <Section aria-labelledby="featured-homes">
        <Container className="flex flex-col gap-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow>Featured residences</Eyebrow>
              <h2 id="featured-homes" className="mt-2 font-display text-3xl text-fg">
                New this season
              </h2>
            </div>
            <Button href="/properties" intent="secondary">
              View all {total.toLocaleString("en-US")} homes
            </Button>
          </div>
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {newest.map((home) => (
              <li key={home.slug}>
                <PropertyCard listing={home} href={`/properties/${home.slug}`} pricePerSqft={home.pricePerSqft} saveable />
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      {types.length > 0 ? (
        <Section tone="raised" aria-labelledby="browse-types">
          <Container className="flex flex-col gap-8">
            <div>
              <Eyebrow>Browse by type</Eyebrow>
              <h2 id="browse-types" className="mt-2 font-display text-3xl text-fg">
                Ways to live in Sylhet
              </h2>
            </div>
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {types.map((tile) => (
                <li key={tile.type} className="group relative overflow-hidden rounded-2xl">
                  <ListingImage src={tile.cover?.url ?? null} alt="" className="aspect-[4/5] transition duration-base group-hover:scale-[1.02]" />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-overlay via-overlay to-transparent p-5 pt-12 text-on-accent">
                    <p className="inline-block rounded bg-overlay px-1.5 py-0.5 text-xs">
                      {tile.count} {tile.count === 1 ? "home" : "homes"} · from {formatPrice(tile.fromPrice)}
                    </p>
                    <Link
                      href={`/properties?type=${tile.type.toLowerCase()}`}
                      className="font-display text-2xl after:absolute after:inset-0 after:content-['']"
                    >
                      {propertyTypeLabels[tile.type]}
                      <ArrowRight aria-hidden="true" className="ml-1 inline h-5 w-5" />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </Container>
        </Section>
      ) : null}
    </>
  );
}
