import { Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eyebrow } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/state";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { cn } from "@/lib/cn";
import { propertyTypeLabels } from "@/lib/domain/listing-card";
import { formatPrice } from "@/lib/format";
import { listAgencyListings, listingTabs, type ListingTab } from "@/lib/server/agent-listings";
import { requireAgent } from "@/lib/server/auth";
import { statusBadge } from "./status";

export const metadata: Metadata = { title: "Properties" };

const path = "/dashboard/listings";

const tabLabels: Record<ListingTab, string> = {
  all: "All",
  published: "Published",
  unpublished: "Unpublished",
  drafts: "Drafts",
  sold: "Sold",
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

type Query = { tab: ListingTab; q: string; mine: boolean; cursor: string | null };

function href(query: Query, change: Partial<Query>) {
  const next = { ...query, cursor: null, ...change };
  const params = new URLSearchParams();
  if (next.tab !== "all") params.set("tab", next.tab);
  if (next.q) params.set("q", next.q);
  if (!next.mine) params.set("mine", "0");
  if (next.cursor) params.set("cursor", next.cursor);
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

// `/dashboard/listings` (spec 0005, AC-1): every agency listing, 25 a page,
// newest updated first.
export default function ListingsPage({ searchParams }: PageProps<"/dashboard/listings">) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Agent dashboard</Eyebrow>
          <h1 className="mt-2 font-display text-3xl text-fg sm:text-4xl">Properties</h1>
        </div>
        <Button href={`${path}/new`}>
          <Plus aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
          New listing
        </Button>
      </div>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <ListingsTable searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ListingsTable({ searchParams }: Pick<PageProps<"/dashboard/listings">, "searchParams">) {
  const params = await searchParams;
  const tabParam = first(params.tab);
  const query: Query = {
    tab: listingTabs.includes(tabParam as ListingTab) ? (tabParam as ListingTab) : "all",
    q: (first(params.q) ?? "").trim().slice(0, 120),
    mine: first(params.mine) !== "0",
    cursor: first(params.cursor) ?? null,
  };
  const agent = await requireAgent({ next: href(query, { cursor: query.cursor }) });
  const { rows, nextCursor } = await listAgencyListings({ ...query, agentId: agent.id });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Listing status" className="flex flex-wrap gap-1 rounded-full bg-surface-sunken p-1">
          {listingTabs.map((tab) => (
            <Link
              key={tab}
              href={href(query, { tab })}
              aria-current={query.tab === tab ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-fast",
                query.tab === tab ? "bg-surface-raised text-fg shadow-soft" : "text-fg-muted hover:text-fg",
              )}
            >
              {tabLabels[tab]}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-3">
          <form action={path} role="search" className="relative">
            {query.tab !== "all" ? <input type="hidden" name="tab" value={query.tab} /> : null}
            {query.mine ? null : <input type="hidden" name="mine" value="0" />}
            <label htmlFor="listing-search">
              <VisuallyHidden>Search by title or reference</VisuallyHidden>
            </label>
            <Search
              aria-hidden="true"
              strokeWidth={1.5}
              className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-fg-subtle"
            />
            <Input
              id="listing-search"
              name="q"
              type="search"
              defaultValue={query.q}
              placeholder="Title or AUR-1042"
              className="w-64 max-w-full pl-10"
            />
          </form>
          <Link
            href={href(query, { mine: !query.mine })}
            role="switch"
            aria-checked={query.mine}
            className="flex items-center gap-2 rounded-full px-3 py-2 text-sm text-fg hover:bg-surface-sunken"
          >
            <span
              aria-hidden="true"
              className={cn(
                "relative h-5 w-9 rounded-full transition-colors duration-fast",
                query.mine ? "bg-accent" : "bg-line-strong",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-4 w-4 rounded-full bg-surface-raised transition-all duration-fast",
                  query.mine ? "left-4.5" : "left-0.5",
                )}
              />
            </span>
            Mine only
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No listings here"
          body={query.q ? "Nothing matches that search." : "Start one now and finish it later."}
          action={<Button href={`${path}/new`}>New listing</Button>}
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface-raised">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="border-b border-line text-xs tracking-wide text-fg-subtle uppercase">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Property</th>
                <th scope="col" className="px-4 py-3 font-medium">Area</th>
                <th scope="col" className="px-4 py-3 font-medium">Price</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Open leads</th>
                <th scope="col" className="px-4 py-3 font-medium">Advisor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-surface-sunken">
                  <td className="px-4 py-3">
                    <Link href={`${path}/${row.id}`} className="font-medium text-fg hover:text-accent">
                      {row.title}
                    </Link>
                    <span className="block text-xs text-fg-muted">
                      {row.refCode} · {propertyTypeLabels[row.propertyType]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{row.areaName}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-fg">{row.priceBdt === null ? "" : formatPrice(row.priceBdt)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={statusBadge[row.status].tone}>{statusBadge[row.status].label}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right text-fg tabular-nums">{row.openLeads}</td>
                  <td className="px-4 py-3 text-fg-muted">{row.advisor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {query.cursor || nextCursor ? (
        <nav aria-label="Pages" className="flex justify-between gap-3">
          {query.cursor ? (
            <Button href={href(query, {})} intent="ghost" size="sm">
              Back to the first page
            </Button>
          ) : (
            <span />
          )}
          {nextCursor ? (
            <Button href={href(query, { cursor: nextCursor })} intent="secondary" size="sm">
              Next page
            </Button>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
