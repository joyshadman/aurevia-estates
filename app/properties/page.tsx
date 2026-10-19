import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchView } from "@/components/search/search-view";
import { Container } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { parseSearchState, serializeSearchState, toFilters, type SearchRefs, type SearchState } from "@/lib/domain/search-params";
import { countListings, searchFacets, searchListings, searchRefs } from "@/lib/server/public-search";
import { siteUrl } from "@/lib/server/sign-in";

// The discovery page (spec 0010). Everything about a search lives in the URL.

// AC-13: only the base page and a single area alone are indexable.
function indexableArea(state: SearchState, refs: SearchRefs, raw: Record<string, string | string[] | undefined>) {
  const keys = Object.keys(raw);
  if (keys.length !== 1 || keys[0] !== "area" || state.areas.length !== 1 || typeof raw.area !== "string") return null;
  return refs.areas.find((a) => a.slug === state.areas[0]) ?? null;
}

export async function generateMetadata({ searchParams }: PageProps<"/properties">): Promise<Metadata> {
  const raw = await searchParams;
  const refs = await searchRefs();
  const state = parseSearchState(raw, refs);
  const base = `${siteUrl()}/properties`;
  if (Object.keys(raw).length === 0) {
    return { title: "Homes for sale in Sylhet", alternates: { canonical: base } };
  }
  const area = indexableArea(state, refs, raw);
  if (area) {
    return { title: `Homes for sale in ${area.nameEn}`, alternates: { canonical: `${base}?${serializeSearchState(state)}` } };
  }
  return { title: "Homes for sale in Sylhet", alternates: { canonical: base }, robots: { index: false, follow: true } };
}

export default function PropertiesPage({ searchParams }: PageProps<"/properties">) {
  return (
    <Container className="flex flex-col gap-6 py-10">
      <div>
        <h1 className="font-display text-4xl text-fg">Homes for sale in Sylhet</h1>
        <p className="mt-2 text-fg-muted">Every home checked by hand. Filter, or describe what you need to the assistant.</p>
      </div>
      <Suspense fallback={<SearchSkeleton />}>
        <Search searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function Search({ searchParams }: { searchParams: PageProps<"/properties">["searchParams"] }) {
  const refs = await searchRefs();
  const state = parseSearchState(await searchParams, refs);
  const filters = toFilters(state, refs);
  const [first, total, facets] = await Promise.all([searchListings(filters), countListings(filters), searchFacets(filters)]);
  return <SearchView state={state} refs={refs} facets={facets} total={total} items={first.items} nextCursor={first.nextCursor} />;
}

function SearchSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <Skeleton className="h-11 w-full max-w-md" />
      <div className="flex gap-8">
        <Skeleton className="hidden h-[480px] w-64 lg:block" />
        <div className="grid flex-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-80 rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
