"use client";

import { Lock } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Radio } from "@/components/ui/radio";
import { Select } from "@/components/ui/select";

// Spec 0023: example periods only. Prices are not set, and the pay button stays
// disabled: nothing on this page calls a server or a payment service (AC-2).
const periods = [
  { days: 7, label: "7 days" },
  { days: 14, label: "14 days" },
  { days: 30, label: "30 days" },
];

export function FeaturePreview({ listings }: { listings: { id: string; title: string; refCode: string }[] }) {
  const [listingId, setListingId] = useState(listings[0].id);
  const [days, setDays] = useState(14);

  return (
    <section className="flex max-w-2xl flex-col gap-6 rounded-3xl border border-line bg-surface-raised p-6 shadow-soft sm:p-8">
      <Field id="featured-listing" label="Listing">
        <Select value={listingId} onChange={(event) => setListingId(event.target.value)}>
          {listings.map((listing) => (
            <option key={listing.id} value={listing.id}>
              {listing.refCode} · {listing.title}
            </option>
          ))}
        </Select>
      </Field>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium text-fg">Feature for</legend>
        {periods.map((period) => (
          <div key={period.days} className="flex items-center justify-between rounded-2xl border border-line px-4 py-3">
            <Radio
              id={`period-${period.days}`}
              name="period"
              label={period.label}
              checked={days === period.days}
              onChange={() => setDays(period.days)}
            />
            <span className="text-sm text-fg-muted">Price to be announced</span>
          </div>
        ))}
      </fieldset>
      <div className="flex flex-col gap-2">
        <Button type="button" intent="primary" disabled aria-describedby="featured-note">
          <Lock aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
          Pay and feature
        </Button>
        <p id="featured-note" className="text-sm text-fg-muted">
          Payments are coming soon. Ask the agency owner if you need a home featured before then.
        </p>
      </div>
    </section>
  );
}
