"use server";

import { z } from "zod";
import { parseSearchState, toFilters } from "@/lib/domain/search-params";
import { countListings, searchListings, searchRefs, type SearchCard } from "@/lib/server/public-search";

// Public search actions (spec 0010): "Show more homes" and the phone sheet's
// live count. Both read the same cached search as the page; no session read.

const query = z.string().max(2000);

async function filtersFrom(raw: string) {
  const refs = await searchRefs();
  return toFilters(parseSearchState(new URLSearchParams(raw), refs), refs);
}

export async function loadMoreListingsAction(rawQuery: string, cursor: string): Promise<{ items: SearchCard[]; nextCursor: string | null }> {
  const parsed = z.object({ q: query, cursor: z.string().max(200) }).safeParse({ q: rawQuery, cursor });
  if (!parsed.success) return { items: [], nextCursor: null };
  return searchListings(await filtersFrom(parsed.data.q), parsed.data.cursor);
}

export async function countListingsAction(rawQuery: string): Promise<{ total: number }> {
  const parsed = query.safeParse(rawQuery);
  return { total: await countListings(await filtersFrom(parsed.success ? parsed.data : "")) };
}
