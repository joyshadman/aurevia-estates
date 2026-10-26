"use client";

import { SlidersHorizontal } from "lucide-react";
import Form from "next/form";
import { useRouter } from "next/navigation";
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { discoveryHref, discoveryPath, discoverySorts, sortLabels, type DiscoveryQuery } from "@/lib/domain/discovery";

// The filter panel folds away below `lg` behind a toggle (spec 0010). On large
// screens it is always open.
export function FilterPanel({ activeCount, children }: { activeCount: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="rounded-2xl border border-line bg-surface-raised shadow-soft lg:sticky lg:top-24">
      <div className="flex items-center justify-between gap-3 px-6 py-5">
        <h2 className="font-display text-xl text-fg">Refine</h2>
        <span className="hidden text-xs text-fg-subtle lg:inline">{activeCount > 0 ? `${activeCount} active` : "No filters"}</span>
        <Button
          type="button"
          intent="secondary"
          size="sm"
          className="lg:hidden"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          <SlidersHorizontal aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
          {open ? "Hide filters" : activeCount > 0 ? `Filters (${activeCount})` : "Filters"}
        </Button>
      </div>
      <div id={panelId} className={cn(open ? "block" : "hidden", "border-t border-line lg:block")}>
        {children}
      </div>
    </div>
  );
}

// AC-4: applies on change. Without JavaScript, the Apply button submits the same query.
export function SortSelect({ query }: { query: DiscoveryQuery }) {
  const router = useRouter();
  const id = useId();
  return (
    <Form action={discoveryPath} className="flex items-center gap-2">
      <HiddenQuery query={query} omit={["sort", "page"]} />
      <label htmlFor={id} className="text-sm text-fg-muted">
        Sort
      </label>
      <Select
        id={id}
        name="sort"
        defaultValue={query.sort}
        className="h-10 w-48"
        onChange={(event) => router.push(discoveryHref(query, { sort: event.target.value as DiscoveryQuery["sort"] }))}
      >
        {discoverySorts.map((sort) => (
          <option key={sort} value={sort}>
            {sortLabels[sort]}
          </option>
        ))}
      </Select>
      <noscript>
        <Button type="submit" intent="secondary" size="sm">
          Apply
        </Button>
      </noscript>
    </Form>
  );
}

type QueryKey = keyof DiscoveryQuery;

// Carries the rest of the query through a GET form that edits only some of it.
export function HiddenQuery({ query, omit }: { query: DiscoveryQuery; omit: QueryKey[] }) {
  const keep = (key: QueryKey) => !omit.includes(key);
  return (
    <>
      {keep("q") && query.q ? <input type="hidden" name="q" value={query.q} /> : null}
      {keep("areas") ? query.areas.map((area) => <input key={area} type="hidden" name="area" value={area} />) : null}
      {keep("types") ? query.types.map((type) => <input key={type} type="hidden" name="type" value={type.toLowerCase()} />) : null}
      {keep("min") && query.min !== null ? <input type="hidden" name="min" value={query.min} /> : null}
      {keep("max") && query.max !== null ? <input type="hidden" name="max" value={query.max} /> : null}
      {keep("beds") && query.beds !== null ? <input type="hidden" name="beds" value={query.beds} /> : null}
      {keep("amenities") ? query.amenities.map((slug) => <input key={slug} type="hidden" name="amenity" value={slug} />) : null}
      {keep("sort") && query.sort !== "newest" ? <input type="hidden" name="sort" value={query.sort} /> : null}
      {keep("view") && query.view !== "grid" ? <input type="hidden" name="view" value={query.view} /> : null}
    </>
  );
}
