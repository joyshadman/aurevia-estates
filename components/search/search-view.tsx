"use client";

import { LayoutGrid, List, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { PropertyCard } from "@/components/listing/property-card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/state";
import { cn } from "@/lib/cn";
import {
  chipsFor,
  chosenCount,
  emptyState,
  filtersSentence,
  serializeSearchState,
  type SearchRefs,
  type SearchSort,
  type SearchState,
} from "@/lib/domain/search-params";
import type { SearchCard } from "@/lib/server/public-search";
import { countListingsAction, loadMoreListingsAction } from "@/app/properties/actions";
import { FilterFields, type Facets } from "./filter-fields";
import { useSearchNav } from "./use-search-nav";

type Props = {
  state: SearchState;
  refs: SearchRefs;
  facets: Facets;
  total: number;
  items: SearchCard[];
  nextCursor: string | null;
};

const sortLabels: Record<SearchSort, string> = {
  newest: "Newest first",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
};

const homes = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "home matches" : "homes match"}`;

// The discovery page body (spec 0010). The URL is the source of truth; this
// component only reads it (via props) and navigates to new URLs.
export function SearchView(props: Props) {
  const { state, refs } = props;
  const { go, pending } = useSearchNav();
  const [sheetOpen, setSheetOpen] = useState(false);
  const assistantHref = `/assistant?${new URLSearchParams({ q: filtersSentence(state, refs) })}`;
  const chips = chipsFor(state, refs);

  return (
    <div className="flex flex-col gap-6">
      <KeywordBox state={state} assistantHref={assistantHref} onSearch={(q) => go({ ...state, q }, "replace")} />

      <div className="flex flex-col gap-8 lg:flex-row">
        <aside aria-label="Filters" className="hidden lg:block lg:w-64 lg:shrink-0">
          <FilterFields state={state} refs={refs} facets={props.facets} onChange={(next) => go(next)} idPrefix="panel" />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-4" aria-busy={pending}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p aria-live="polite" className="text-sm text-fg-muted">
              {homes(props.total)}
            </p>
            <div className="flex items-center gap-2">
              <Button intent="secondary" size="sm" className="lg:hidden" onClick={() => setSheetOpen(true)}>
                <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
                Filters{chosenCount(state) > 0 ? ` (${chosenCount(state)})` : ""}
              </Button>
              <label htmlFor="search-sort" className="sr-only">
                Sort
              </label>
              <Select id="search-sort" value={state.sort} onChange={(e) => go({ ...state, sort: e.target.value as SearchSort })} className="h-9 w-48">
                {(Object.keys(sortLabels) as SearchSort[]).map((sort) => (
                  <option key={sort} value={sort}>
                    {sortLabels[sort]}
                  </option>
                ))}
              </Select>
              <div role="group" aria-label="View" className="flex rounded-full border border-line-strong p-0.5">
                {(["grid", "list"] as const).map((view) => (
                  <Button
                    key={view}
                    size="sm"
                    intent={state.view === view ? "primary" : "ghost"}
                    icon
                    aria-pressed={state.view === view}
                    aria-label={view === "grid" ? "Grid view" : "List view"}
                    onClick={() => go({ ...state, view })}
                  >
                    {view === "grid" ? <LayoutGrid aria-hidden="true" className="h-4 w-4" /> : <List aria-hidden="true" className="h-4 w-4" />}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {chips.length > 0 ? (
            <ul aria-label="Active filters" className="flex flex-wrap items-center gap-2">
              {chips.map((chip) => (
                <li key={chip.key}>
                  <button
                    type="button"
                    onClick={() => go(chip.remove)}
                    aria-label={`Remove filter ${chip.label}`}
                    className="inline-flex items-center gap-1 rounded-full bg-accent-subtle px-3 py-1.5 text-xs font-medium text-accent-subtle-fg hover:bg-surface-sunken"
                  >
                    {chip.label}
                    <X aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
              <li>
                <button type="button" onClick={() => go({ ...emptyState, sort: state.sort, view: state.view })} className="text-xs text-accent hover:underline">
                  Clear all
                </button>
              </li>
            </ul>
          ) : null}

          {props.total === 0 ? (
            <EmptyState
              title="No homes match these filters"
              body="Try fewer filters, or tell the assistant what you're looking for."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button intent="secondary" onClick={() => go({ ...emptyState, view: state.view })}>
                    Clear filters
                  </Button>
                  <Button href={assistantHref}>Describe it to the assistant</Button>
                </div>
              }
            />
          ) : (
            <Results key={serializeSearchState({ ...state, view: "grid" })} {...props} assistantHref={assistantHref} />
          )}
        </div>
      </div>

      <FilterSheet open={sheetOpen} onClose={() => setSheetOpen(false)} {...props} onApply={(next) => go(next)} />
    </div>
  );
}

// AC-3: the keyword box, applied 300 ms after typing stops (AC-8).
function KeywordBox({ state, assistantHref, onSearch }: { state: SearchState; assistantHref: string; onSearch: (q: string) => void }) {
  const [text, setText] = useState(state.q);
  const [seenQ, setSeenQ] = useState(state.q);
  // Follow the URL (a removed keyword chip clears the box); typing never fights it.
  if (seenQ !== state.q) {
    setSeenQ(state.q);
    if (text.trim() !== state.q) setText(state.q);
  }
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const schedule = (value: string) => {
    setText(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onSearch(value.trim()), 300);
  };
  return (
    <form
      role="search"
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        onSearch(text.trim());
      }}
    >
      <label htmlFor="search-keyword" className="sr-only">
        Search by area, title, or code
      </label>
      <Input id="search-keyword" type="search" value={text} maxLength={80} onChange={(e) => schedule(e.target.value)} placeholder="Area, title, or AUR code" className="sm:max-w-md" />
      <Button type="submit" intent="secondary">
        Search
      </Button>
      <Button href={assistantHref} intent="ghost">
        <Sparkles aria-hidden="true" className="h-4 w-4" />
        Describe it instead
      </Button>
    </form>
  );
}

// AC-1, AC-6, AC-11, AC-12: the cards, the assistant nudge, and "Show more homes".
function Results(props: Props & { assistantHref: string }) {
  const [items, setItems] = useState(props.items);
  const [cursor, setCursor] = useState(props.nextCursor);
  const [failed, setFailed] = useState(false);
  const [loading, startLoading] = useTransition();
  const firstNew = useRef<number | null>(null);
  const list = useRef<HTMLUListElement>(null);
  const query = serializeSearchState({ ...props.state, view: "grid" });
  const listView = props.state.view === "list";

  useEffect(() => {
    if (firstNew.current === null) return;
    list.current?.querySelectorAll<HTMLElement>("li[data-card] a")[firstNew.current]?.focus();
    firstNew.current = null;
  }, [items]);

  function loadMore() {
    if (!cursor) return;
    setFailed(false);
    startLoading(async () => {
      try {
        const next = await loadMoreListingsAction(query, cursor);
        firstNew.current = items.length;
        setItems((current) => [...current, ...next.items]);
        setCursor(next.nextCursor);
      } catch {
        setFailed(true);
      }
    });
  }

  const cards = items.map((item) => (
    <li key={item.slug} data-card>
      <PropertyCard listing={item} href={`/properties/${item.slug}`} layout={listView ? "list" : "grid"} pricePerSqft={item.pricePerSqft} saveable />
    </li>
  ));
  // A nudge into the assistant after the 6th result (AC-11).
  if (cards.length > 6) {
    cards.splice(
      6,
      0,
      <li key="assistant" className={cn("flex flex-col justify-center gap-3 rounded-2xl bg-accent-subtle p-6 text-accent-subtle-fg", !listView && "sm:col-span-2 xl:col-span-3")}>
        <p className="font-display text-xl">Not quite right?</p>
        <p className="text-sm">Tell the Aurevia Assistant how your family lives, and it will match homes to you.</p>
        <Button href={props.assistantHref} className="self-start">
          <Sparkles aria-hidden="true" className="h-4 w-4" />
          Describe it instead
        </Button>
      </li>,
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ul ref={list} className={cn("grid gap-6", listView ? "grid-cols-1" : "sm:grid-cols-2 xl:grid-cols-3")}>
        {cards}
      </ul>
      {failed ? (
        <p role="alert" className="text-center text-sm text-danger">
          Couldn&apos;t load more homes.{" "}
          <button type="button" onClick={loadMore} className="underline">
            Try again
          </button>
        </p>
      ) : null}
      {cursor ? (
        <Button intent="secondary" className="self-center" onClick={loadMore} loading={loading}>
          Show more homes
        </Button>
      ) : null}
    </div>
  );
}

// AC-8: filters on phones, applied together with a live count.
function FilterSheet(props: Props & { open: boolean; onClose: () => void; onApply: (next: SearchState) => void }) {
  const [draft, setDraft] = useState(props.state);
  const [count, setCount] = useState(props.total);
  const [seen, setSeen] = useState(props.state);
  if (seen !== props.state) {
    setSeen(props.state);
    setDraft(props.state);
    setCount(props.total);
  }

  function change(next: SearchState) {
    setDraft(next);
    void countListingsAction(serializeSearchState(next)).then((r) => setCount(r.total));
  }

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title="Filters"
      placement="bottom"
      footer={
        <>
          <Button intent="ghost" onClick={() => change({ ...emptyState, sort: draft.sort, view: draft.view })}>
            Reset
          </Button>
          <Button
            onClick={() => {
              props.onApply(draft);
              props.onClose();
            }}
          >
            Show {count.toLocaleString("en-US")} {count === 1 ? "home" : "homes"}
          </Button>
        </>
      }
    >
      <FilterFields state={draft} refs={props.refs} facets={props.facets} onChange={change} idPrefix="sheet" />
    </Dialog>
  );
}
