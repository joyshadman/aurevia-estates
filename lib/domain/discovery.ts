import { normalizeBanglaDigits } from "@/lib/domain/bangla";
import { propertyTypes, type PropertyType } from "@/lib/domain/listing-card";

// The discovery page's URL is its state (spec 0010, *Assumption built on*).
// Pure, so the page, the chips, and the sort select share one parser and one
// link builder. Invalid values are dropped, never an error (AC-3).

export const discoveryPath = "/properties";
export const discoveryPageSize = 12;
export const discoverySorts = ["newest", "price_asc", "price_desc"] as const;
export type DiscoverySort = (typeof discoverySorts)[number];
// `map` is spec 0013's view: every match as a pin, no paging.
export type DiscoveryView = "grid" | "list" | "map";

export const sortLabels: Record<DiscoverySort, string> = {
  newest: "Newest first",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
};

// Whole taka: 25, 50, 75 lakh; 1, 1.5, 2, 3, 5, 7, 10 crore.
export const priceSteps = [2_500_000, 5_000_000, 7_500_000, 10_000_000, 15_000_000, 20_000_000, 30_000_000, 50_000_000, 70_000_000, 100_000_000];
export const bedSteps = [1, 2, 3, 4, 5] as const;

export type DiscoveryQuery = {
  q: string;
  areas: string[];
  types: PropertyType[];
  min: number | null;
  max: number | null;
  beds: number | null;
  amenities: string[];
  sort: DiscoverySort;
  view: DiscoveryView;
  page: number;
};

type Params = Record<string, string | string[] | undefined>;

const maxKeyword = 80;
const maxPrice = 1_000_000_000_000;
const maxPage = 1000;
const slugPattern = /^[a-z0-9-]{1,60}$/;

const all = (value: string | string[] | undefined) => (value === undefined ? [] : Array.isArray(value) ? value : [value]);
const first = (value: string | string[] | undefined) => all(value)[0];

const slugs = (value: string | string[] | undefined) =>
  [...new Set(all(value).map((item) => item.trim().toLowerCase()))].filter((item) => slugPattern.test(item)).slice(0, 20);

function taka(value: string | string[] | undefined): number | null {
  const raw = normalizeBanglaDigits(first(value) ?? "").replace(/[,\s]/g, "");
  if (!/^\d{1,13}$/.test(raw)) return null;
  const amount = Number(raw);
  return amount >= 1 && amount <= maxPrice ? amount : null;
}

export function parseDiscoveryQuery(params: Params): DiscoveryQuery {
  const types = all(params.type)
    .map((item) => item.trim().toUpperCase())
    .filter((item): item is PropertyType => (propertyTypes as readonly string[]).includes(item));
  let min = taka(params.min);
  let max = taka(params.max);
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  const beds = Number(first(params.beds));
  const sort = first(params.sort);
  const page = Number(first(params.page));
  return {
    q: (first(params.q) ?? "").trim().slice(0, maxKeyword),
    areas: slugs(params.area),
    types: [...new Set(types)],
    min,
    max,
    beds: (bedSteps as readonly number[]).includes(beds) ? beds : null,
    amenities: slugs(params.amenity),
    sort: discoverySorts.includes(sort as DiscoverySort) ? (sort as DiscoverySort) : "newest",
    view: first(params.view) === "list" ? "list" : first(params.view) === "map" ? "map" : "grid",
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, maxPage) : 1,
  };
}

// Any change other than `page` goes back to page 1.
export function discoveryHref(query: DiscoveryQuery, change: Partial<DiscoveryQuery> = {}): string {
  const next = { ...query, page: 1, ...change };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  for (const area of next.areas) params.append("area", area);
  for (const type of next.types) params.append("type", type.toLowerCase());
  if (next.min !== null) params.set("min", String(next.min));
  if (next.max !== null) params.set("max", String(next.max));
  if (next.beds !== null) params.set("beds", String(next.beds));
  for (const amenity of next.amenities) params.append("amenity", amenity);
  if (next.sort !== "newest") params.set("sort", next.sort);
  if (next.view !== "grid") params.set("view", next.view);
  if (next.page > 1) params.set("page", String(next.page));
  const search = params.toString();
  return search ? `${discoveryPath}?${search}` : discoveryPath;
}

export function activeFilterCount(query: DiscoveryQuery): number {
  return (
    (query.q ? 1 : 0) +
    query.areas.length +
    query.types.length +
    (query.min !== null || query.max !== null ? 1 : 0) +
    (query.beds !== null ? 1 : 0) +
    query.amenities.length
  );
}

// "BDT 50 lakh", "BDT 1.5 crore": how buyers in Sylhet say a budget.
export function formatPriceStep(bdt: number): string {
  const amount = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
  if (bdt >= 10_000_000) return `BDT ${amount(bdt / 10_000_000)} crore`;
  if (bdt >= 100_000) return `BDT ${amount(bdt / 100_000)} lakh`;
  return `BDT ${amount(bdt)}`;
}

export function priceRangeLabel(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `${formatPriceStep(min)} to ${formatPriceStep(max)}`;
  if (min !== null) return `From ${formatPriceStep(min)}`;
  return `Up to ${formatPriceStep(max ?? 0)}`;
}
