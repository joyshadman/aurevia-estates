import { parseListingCode } from "@/lib/domain/chat-text";
import { propertyTypeLabels, propertyTypes, type PropertyType } from "@/lib/domain/listing-card";

// Search state in the URL (spec 0010, AC-4). Pure: the page, the client
// controls, the actions, and the tests share it. The URL is the single source
// of truth; `SearchFilters` is the normalized form the queries and caches use.

export const sorts = ["newest", "price-asc", "price-desc"] as const;
export type SearchSort = (typeof sorts)[number];
// Feature 13 (spec 0011) adds "map".
export const views = ["grid", "list", "map"] as const;
export type SearchView = (typeof views)[number];

const lakh = 100_000;
const crore = 10_000_000;

// AC-2: the price presets, in whole taka.
export const pricePresets: { value: number; label: string }[] = [
  { value: 25 * lakh, label: "25 lakh" },
  { value: 50 * lakh, label: "50 lakh" },
  { value: 75 * lakh, label: "75 lakh" },
  { value: 1 * crore, label: "1 crore" },
  { value: 1.5 * crore, label: "1.5 crore" },
  { value: 2 * crore, label: "2 crore" },
  { value: 3 * crore, label: "3 crore" },
  { value: 5 * crore, label: "5 crore" },
  { value: 7 * crore, label: "7 crore" },
  { value: 10 * crore, label: "10 crore" },
];
const presetLabel = new Map(pricePresets.map((p) => [p.value, p.label]));

export const bedOptions = [1, 2, 3, 4, 5] as const;

export type SearchRefs = {
  areas: { id: string; slug: string; nameEn: string; nameBn: string }[];
  amenities: { id: string; slug: string; label: string }[];
};

// What the URL says, validated against the refs; slugs and lowercase types.
export type SearchState = {
  areas: string[];
  types: string[];
  min: number | null;
  max: number | null;
  beds: number | null;
  amenities: string[];
  q: string;
  sort: SearchSort;
  view: SearchView;
};

export const emptyState: SearchState = { areas: [], types: [], min: null, max: null, beds: null, amenities: [], q: "", sort: "newest", view: "grid" };

// What the queries use (ids, uppercase types), sorted so equal searches share a cache entry.
export type SearchFilters = {
  areaIds: string[];
  propertyTypes: PropertyType[];
  minPrice: number | null;
  maxPrice: number | null;
  minBedrooms: number | null;
  amenityIds: string[];
  titleQuery: string | null;
  refCode: string | null;
  sort: SearchSort;
};

type RawParams = Record<string, string | string[] | undefined> | URLSearchParams;

function all(params: RawParams, key: string): string[] {
  if (params instanceof URLSearchParams) return params.getAll(key);
  const value = params[key];
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

const first = (params: RawParams, key: string) => all(params, key)[0];
const uniqSorted = (values: string[]) => [...new Set(values)].sort();

// Invalid or unknown values are dropped silently (AC-4).
export function parseSearchState(params: RawParams, refs: SearchRefs): SearchState {
  const areaSlugs = new Set(refs.areas.map((a) => a.slug));
  const amenitySlugs = new Set(refs.amenities.map((a) => a.slug));
  const typeSet = new Set(propertyTypes.map((t) => t.toLowerCase()));
  const price = (key: string) => {
    const value = Number(first(params, key));
    return presetLabel.has(value) ? value : null;
  };
  const min = price("min");
  let max = price("max");
  if (min !== null && max !== null && max < min) max = null;
  const beds = Number(first(params, "beds"));
  const sort = first(params, "sort");
  const view = first(params, "view");
  return {
    areas: uniqSorted(all(params, "area").filter((s) => areaSlugs.has(s))).slice(0, 20),
    types: uniqSorted(all(params, "type").map((t) => t.toLowerCase()).filter((t) => typeSet.has(t))),
    min,
    max,
    beds: Number.isInteger(beds) && beds >= 1 && beds <= 5 ? beds : null,
    amenities: uniqSorted(all(params, "amenity").filter((s) => amenitySlugs.has(s))).slice(0, 20),
    q: (first(params, "q") ?? "").trim().slice(0, 80),
    sort: (sorts as readonly string[]).includes(sort ?? "") ? (sort as SearchSort) : "newest",
    view: (views as readonly string[]).includes(view ?? "") ? (view as SearchView) : "grid",
  };
}

// The canonical query string: defaults left out, repeats sorted (AC-4).
export function serializeSearchState(state: SearchState): string {
  const params = new URLSearchParams();
  for (const area of uniqSorted(state.areas)) params.append("area", area);
  for (const type of uniqSorted(state.types)) params.append("type", type);
  if (state.min !== null) params.set("min", String(state.min));
  if (state.max !== null) params.set("max", String(state.max));
  if (state.beds !== null) params.set("beds", String(state.beds));
  for (const amenity of uniqSorted(state.amenities)) params.append("amenity", amenity);
  if (state.q) params.set("q", state.q);
  if (state.sort !== "newest") params.set("sort", state.sort);
  if (state.view !== "grid") params.set("view", state.view);
  return params.toString();
}

export function searchHref(state: SearchState): string {
  const query = serializeSearchState(state);
  return `/properties${query ? `?${query}` : ""}`;
}

// The keyword (AC-3): an exact area name or slug becomes an area filter; a code
// matches that code; anything else searches titles.
export function keywordMatch(q: string, refs: SearchRefs): { areaId?: string; refCode?: string; titleQuery?: string } {
  const text = q.trim();
  if (!text) return {};
  const lower = text.toLowerCase();
  const area = refs.areas.find((a) => a.slug === lower || a.nameEn.toLowerCase() === lower || a.nameBn === text);
  if (area) return { areaId: area.id };
  const code = parseListingCode(text);
  if (code) return { refCode: code };
  return { titleQuery: text };
}

export function toFilters(state: SearchState, refs: SearchRefs): SearchFilters {
  const areaIds = new Map(refs.areas.map((a) => [a.slug, a.id]));
  const amenityIds = new Map(refs.amenities.map((a) => [a.slug, a.id]));
  const keyword = keywordMatch(state.q, refs);
  const areas = state.areas.flatMap((s) => areaIds.get(s) ?? []);
  if (keyword.areaId) areas.push(keyword.areaId);
  return {
    areaIds: uniqSorted(areas),
    propertyTypes: uniqSorted(state.types.map((t) => t.toUpperCase())) as PropertyType[],
    minPrice: state.min,
    maxPrice: state.max,
    minBedrooms: state.beds,
    amenityIds: uniqSorted(state.amenities.flatMap((s) => amenityIds.get(s) ?? [])),
    titleQuery: keyword.titleQuery ?? null,
    refCode: keyword.refCode ?? null,
    sort: state.sort,
  };
}

// How many values are chosen, for "Filters (N)" (AC-8).
export function chosenCount(state: SearchState): number {
  return state.areas.length + state.types.length + (state.min !== null || state.max !== null ? 1 : 0) + (state.beds !== null ? 1 : 0) + state.amenities.length;
}

// AC-9 chip text for a price range.
export function priceRangeLabel(min: number | null, max: number | null): string | null {
  const lo = min !== null ? presetLabel.get(min) : null;
  const hi = max !== null ? presetLabel.get(max) : null;
  if (lo && hi) return `${lo} to ${hi}`;
  if (lo) return `From ${lo}`;
  if (hi) return `Up to ${hi}`;
  return null;
}

export type Chip = { key: string; label: string; remove: SearchState };

export function chipsFor(state: SearchState, refs: SearchRefs): Chip[] {
  const areaName = new Map(refs.areas.map((a) => [a.slug, a.nameEn]));
  const amenityLabel = new Map(refs.amenities.map((a) => [a.slug, a.label]));
  const chips: Chip[] = [];
  for (const slug of state.areas) chips.push({ key: `area:${slug}`, label: areaName.get(slug) ?? slug, remove: { ...state, areas: state.areas.filter((a) => a !== slug) } });
  for (const type of state.types) {
    chips.push({ key: `type:${type}`, label: propertyTypeLabels[type.toUpperCase() as PropertyType], remove: { ...state, types: state.types.filter((t) => t !== type) } });
  }
  const price = priceRangeLabel(state.min, state.max);
  if (price) chips.push({ key: "price", label: price, remove: { ...state, min: null, max: null } });
  if (state.beds !== null) chips.push({ key: "beds", label: `${state.beds}+ beds`, remove: { ...state, beds: null } });
  for (const slug of state.amenities) {
    chips.push({ key: `amenity:${slug}`, label: amenityLabel.get(slug) ?? slug, remove: { ...state, amenities: state.amenities.filter((a) => a !== slug) } });
  }
  if (state.q) chips.push({ key: "q", label: `“${state.q}”`, remove: { ...state, q: "" } });
  return chips;
}

// AC-11: the filters as a sentence for the assistant's composer.
export function filtersSentence(state: SearchState, refs: SearchRefs): string {
  const areaName = new Map(refs.areas.map((a) => [a.slug, a.nameEn]));
  const amenityLabel = new Map(refs.amenities.map((a) => [a.slug, a.label.toLowerCase()]));
  const typeWords = state.types.map((t) => propertyTypeLabels[t.toUpperCase() as PropertyType].toLowerCase());
  const noun = typeWords.length > 0 ? typeWords.join(" or ") : "home";
  const beds = state.beds !== null ? `${state.beds}+ bedroom ` : "";
  const lead = `${beds}${noun}`;
  const article = /^[aeiou]/i.test(lead) ? "an" : "a";
  const areas = state.areas.map((s) => areaName.get(s) ?? s);
  const parts = [`I'm looking for ${article} ${lead}`, areas.length > 0 ? `in ${areas.join(" or ")}` : "in Sylhet"];
  const lo = state.min !== null ? presetLabel.get(state.min) : null;
  const hi = state.max !== null ? presetLabel.get(state.max) : null;
  if (lo && hi) parts.push(`between BDT ${lo} and ${hi}`);
  else if (lo) parts.push(`from BDT ${lo}`);
  else if (hi) parts.push(`up to BDT ${hi}`);
  const amenities = state.amenities.map((s) => amenityLabel.get(s) ?? s);
  if (amenities.length > 0) parts.push(`with ${amenities.join(", ")}`);
  if (state.q) parts.push(`matching "${state.q}"`);
  return `${parts.join(", ")}.`.slice(0, 500);
}
