import { Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ListingStatusBadge } from "@/components/dashboard/listing-status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/state";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { propertyTypeLabels } from "@/lib/domain/listing-card";
import { listAgencyListings, listingTabs, type ListingTab } from "@/lib/server/agent-listings";
import { requireAgent } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Properties" };

const tabLabels: Record<ListingTab, string> = {
  all: "All",
  published: "Published",
  unpublished: "Unpublished",
  drafts: "Drafts",
  sold: "Sold",
};

type Query = { tab: ListingTab; q: string; mine: boolean; cursor?: string };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseQuery(params: Record<string, string | string[] | undefined>): Query {
  const tab = first(params.tab);
  return {
    tab: listingTabs.includes(tab as ListingTab) ? (tab as ListingTab) : "all",
    q: (first(params.q) ?? "").slice(0, 120),
    // "Mine only" is on unless turned off (spec 0005, AC-1).
    mine: first(params.mine) !== "0",
    cursor: first(params.cursor),
  };
}

function href(query: Query, change: Partial<Query>) {
  const next = { ...query, cursor: undefined, ...change };
  const params = new URLSearchParams();
  if (next.tab !== "all") params.set("tab", next.tab);
  if (next.q) params.set("q", next.q);
  if (!next.mine) params.set("mine", "0");
  if (next.cursor) params.set("cursor", next.cursor);
  const search = params.toString();
  return `/dashboard/listings${search ? `?${search}` : ""}`;
}

export default function ListingsPage({ searchParams }: PageProps<"/dashboard/listings">) {
  // Everything agent specific streams in behind the gate, so the prerendered
  // shell shows nothing but a skeleton (spec 0004, AC-8).
  return (
    <Suspense fallback={<TableSkeleton />}>
      <ListingsTable searchParams={searchParams} />
    </Suspense>
  );
}

async function ListingsTable({ searchParams }: { searchParams: PageProps<"/dashboard/listings">["searchParams"] }) {
  const agent = await requireAgent({ next: "/dashboard/listings" });
  const query = parseQuery(await searchParams);
  const { rows, nextCursor } = await listAgencyListings(query, agent);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-fg">Properties</h1>
          <p className="mt-1 text-sm text-fg-muted">Every listing in the agency. Only published ones reach buyers.</p>
        </div>
        <Button href="/dashboard/listings/new">
          <Plus aria-hidden="true" className="h-4 w-4" />
          New listing
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Listing status" className="flex flex-wrap gap-2">
          {listingTabs.map((tab) => (
            <Link
              key={tab}
              href={href(query, { tab })}
              aria-current={query.tab === tab ? "page" : undefined}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm transition-colors duration-fast",
                query.tab === tab ? "bg-accent-subtle font-medium text-accent-subtle-fg" : "text-fg-muted hover:bg-surface-sunken",
              )}
            >
              {tabLabels[tab]}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-3">
          <form action="/dashboard/listings" role="search" className="flex items-center gap-2">
            {query.tab !== "all" ? <input type="hidden" name="tab" value={query.tab} /> : null}
            {!query.mine ? <input type="hidden" name="mine" value="0" /> : null}
            <label htmlFor="listing-search">
              <VisuallyHidden>Search by title or code</VisuallyHidden>
            </label>
            <Input id="listing-search" name="q" type="search" defaultValue={query.q} placeholder="Title or AUR-1042" className="h-9 w-56" />
            <Button type="submit" size="sm" intent="secondary" icon aria-label="Search">
              <Search aria-hidden="true" className="h-4 w-4" />
            </Button>
          </form>
          <Link
            href={href(query, { mine: !query.mine })}
            role="switch"
            aria-checked={query.mine}
            className="inline-flex items-center gap-2 rounded-full border border-line-strong px-3 py-1.5 text-sm text-fg hover:bg-surface-sunken"
          >
            <span
              aria-hidden="true"
              className={cn("h-3 w-3 rounded-full border border-line-strong", query.mine && "border-accent bg-accent")}
            />
            Mine only
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={query.q ? "No listings match" : "No listings here yet"}
          body={query.q ? "Try another title or code, or turn off Mine only." : "Start one now and finish it when you have the details."}
          action={<Button href="/dashboard/listings/new">New listing</Button>}
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface-raised">
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">Listings, newest updated first</caption>
            <thead className="text-xs text-fg-subtle uppercase">
              <tr className="border-b border-line">
                <th scope="col" className="px-6 py-3 font-medium">Property</th>
                <th scope="col" className="px-4 py-3 font-medium">Area</th>
                <th scope="col" className="px-4 py-3 font-medium">Price</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Open leads</th>
                <th scope="col" className="px-6 py-3 font-medium">Advisor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular-nums">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-surface-sunken/60">
                  <td className="px-6 py-3.5">
                    <Link href={`/dashboard/listings/${row.id}`} className="font-medium text-fg hover:text-accent">
                      {row.title}
                    </Link>
                    <span className="block text-xs text-fg-subtle">
                      {row.refCode} · {propertyTypeLabels[row.propertyType]}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-fg-muted">{row.areaName}</td>
                  <td className="px-4 py-3.5">{row.priceBdt === null ? "" : formatPrice(row.priceBdt)}</td>
                  <td className="px-4 py-3.5">
                    <ListingStatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3.5 text-right">{row.openLeads}</td>
                  <td className="px-6 py-3.5 text-fg-muted">{row.advisor}</td>
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
              Back to first page
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

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <Skeleton className="h-9 w-80" />
      <Skeleton className="h-72 w-full rounded-2xl" />
    </div>
  );
}
