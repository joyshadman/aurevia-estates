"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { propertyTypeLabels, propertyTypes } from "@/lib/domain/listing-card";
import { bedOptions, emptyState, pricePresets, searchHref } from "@/lib/domain/search-params";

// The homepage's quick search (spec 0012): opens /properties with the values in
// the URL (spec 0010).
export function QuickSearch({ areas }: { areas: { slug: string; nameEn: string }[] }) {
  const router = useRouter();
  const [area, setArea] = useState("");
  const [type, setType] = useState("");
  const [max, setMax] = useState("");
  const [beds, setBeds] = useState("");

  const field = (id: string, label: string, control: React.ReactNode) => (
    <label htmlFor={id} className="flex flex-1 flex-col gap-1.5 text-xs font-medium tracking-wide text-fg-subtle uppercase">
      {label}
      {control}
    </label>
  );

  return (
    <form
      role="search"
      aria-label="Find a home"
      className="flex flex-col gap-4 rounded-2xl border border-line bg-surface-raised p-5 shadow-soft md:flex-row md:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(
          searchHref({
            ...emptyState,
            areas: area ? [area] : [],
            types: type ? [type] : [],
            max: max ? Number(max) : null,
            beds: beds ? Number(beds) : null,
          }),
        );
      }}
    >
      {field(
        "home-area",
        "Location",
        <Select id="home-area" value={area} onChange={(e) => setArea(e.target.value)}>
          <option value="">Anywhere in Sylhet</option>
          {areas.map((a) => (
            <option key={a.slug} value={a.slug}>
              {a.nameEn}
            </option>
          ))}
        </Select>,
      )}
      {field(
        "home-type",
        "Property type",
        <Select id="home-type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Any type</option>
          {propertyTypes.map((t) => (
            <option key={t} value={t.toLowerCase()}>
              {propertyTypeLabels[t]}
            </option>
          ))}
        </Select>,
      )}
      {field(
        "home-budget",
        "Budget up to",
        <Select id="home-budget" value={max} onChange={(e) => setMax(e.target.value)}>
          <option value="">Any budget</option>
          {pricePresets.map((p) => (
            <option key={p.value} value={p.value}>
              BDT {p.label}
            </option>
          ))}
        </Select>,
      )}
      {field(
        "home-beds",
        "Bedrooms",
        <Select id="home-beds" value={beds} onChange={(e) => setBeds(e.target.value)}>
          <option value="">Any</option>
          {bedOptions.map((n) => (
            <option key={n} value={n}>
              {n}+ bedrooms
            </option>
          ))}
        </Select>,
      )}
      <Button type="submit" size="lg" className="md:w-36">
        Search
      </Button>
    </form>
  );
}
