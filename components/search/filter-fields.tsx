"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Radio } from "@/components/ui/radio";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { propertyTypeLabels, propertyTypes, type PropertyType } from "@/lib/domain/listing-card";
import { bedOptions, pricePresets, type SearchRefs, type SearchState } from "@/lib/domain/search-params";

export type Facets = { areas: Record<string, number>; types: Record<PropertyType, number> };

const toggle = (list: string[], value: string, on: boolean) => (on ? [...list, value] : list.filter((v) => v !== value));

function Group({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3 border-b border-line pb-5">
      <legend className="mb-3 text-sm font-medium text-fg">{legend}</legend>
      {children}
    </fieldset>
  );
}

function Count({ n }: { n: number | undefined }) {
  return <span className="ml-auto text-xs text-fg-subtle tabular-nums">{n ?? 0}</span>;
}

// The filters (spec 0010, AC-2, AC-7). Used by the desktop panel (instant) and
// the phone sheet (applied together); `idPrefix` keeps the two sets of ids apart.
export function FilterFields({
  state,
  refs,
  facets,
  onChange,
  idPrefix,
}: {
  state: SearchState;
  refs: SearchRefs;
  facets: Facets;
  onChange: (next: SearchState) => void;
  idPrefix: string;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Group legend="Area">
        {refs.areas.map((area) => {
          const n = facets.areas[area.id] ?? 0;
          return (
            <div key={area.slug} className="flex items-center gap-2">
              <Checkbox
                id={`${idPrefix}-area-${area.slug}`}
                label={area.nameEn}
                className={cn(n === 0 && "text-fg-subtle")}
                checked={state.areas.includes(area.slug)}
                onChange={(e) => onChange({ ...state, areas: toggle(state.areas, area.slug, e.target.checked) })}
              />
              <Count n={n} />
            </div>
          );
        })}
      </Group>

      <Group legend="Price (BDT)">
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            Minimum
            <Select value={state.min ?? ""} onChange={(e) => onChange({ ...state, min: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Any</option>
              {pricePresets.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            Maximum
            <Select value={state.max ?? ""} onChange={(e) => onChange({ ...state, max: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Any</option>
              {pricePresets
                .filter((p) => state.min === null || p.value >= state.min)
                .map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
            </Select>
          </label>
        </div>
      </Group>

      <Group legend="Property type">
        {propertyTypes.map((type) => {
          const slug = type.toLowerCase();
          const n = facets.types[type];
          return (
            <div key={type} className="flex items-center gap-2">
              <Checkbox
                id={`${idPrefix}-type-${slug}`}
                label={propertyTypeLabels[type]}
                className={cn(n === 0 && "text-fg-subtle")}
                checked={state.types.includes(slug)}
                onChange={(e) => onChange({ ...state, types: toggle(state.types, slug, e.target.checked) })}
              />
              <Count n={n} />
            </div>
          );
        })}
      </Group>

      <Group legend="Bedrooms">
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <Radio id={`${idPrefix}-beds-any`} name={`${idPrefix}-beds`} label="Any" checked={state.beds === null} onChange={() => onChange({ ...state, beds: null })} />
          {bedOptions.map((n) => (
            <Radio key={n} id={`${idPrefix}-beds-${n}`} name={`${idPrefix}-beds`} label={`${n}+`} checked={state.beds === n} onChange={() => onChange({ ...state, beds: n })} />
          ))}
        </div>
      </Group>

      <Group legend="Amenities">
        {refs.amenities.map((amenity) => (
          <Checkbox
            key={amenity.slug}
            id={`${idPrefix}-amenity-${amenity.slug}`}
            label={amenity.label}
            checked={state.amenities.includes(amenity.slug)}
            onChange={(e) => onChange({ ...state, amenities: toggle(state.amenities, amenity.slug, e.target.checked) })}
          />
        ))}
      </Group>
    </div>
  );
}
