import { MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { formatSylhet, formatSylhetDate, LeadStatusBadge, leadSourceLabels, ViewingStatusBadge } from "@/components/dashboard/lead-badges";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/state";
import { cn } from "@/lib/cn";
import { requireAgent } from "@/lib/server/auth";
import { inboxTabs, listLeads, type InboxTab } from "@/lib/server/lead-inbox";

export const metadata: Metadata = { title: "Leads" };

const tabLabels: Record<InboxTab, string> = { open: "Open", new: "New", all: "All" };

type Query = { tab: InboxTab; mine: boolean; cursor?: string };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function href(query: Query, change: Partial<Query>) {
  const next = { ...query, cursor: undefined, ...change };
  const params = new URLSearchParams();
  if (next.tab !== "open") params.set("tab", next.tab);
  if (!next.mine) params.set("mine", "0");
  if (next.cursor) params.set("cursor", next.cursor);
  const search = params.toString();
  return `/dashboard/leads${search ? `?${search}` : ""}`;
}

// The lead inbox (spec 0008, assumed): open leads assigned to me by default.
export default function LeadsPage({ searchParams }: PageProps<"/dashboard/leads">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <Inbox searchParams={searchParams} />
    </Suspense>
  );
}

async function Inbox({ searchParams }: { searchParams: PageProps<"/dashboard/leads">["searchParams"] }) {
  const agent = await requireAgent({ next: "/dashboard/leads" });
  const params = await searchParams;
  const tab = first(params.tab);
  const query: Query = {
    tab: inboxTabs.includes(tab as InboxTab) ? (tab as InboxTab) : "open",
    mine: first(params.mine) !== "0",
    cursor: first(params.cursor),
  };
  const { rows, nextCursor } = await listLeads(query, agent);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl text-fg">Leads</h1>
        <p className="mt-1 text-sm text-fg-muted">Viewing requests and enquiries. Call or WhatsApp, then record what happened.</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Lead status" className="flex gap-2">
          {inboxTabs.map((t) => (
            <Link
              key={t}
              href={href(query, { tab: t })}
              aria-current={query.tab === t ? "page" : undefined}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm",
                query.tab === t ? "bg-accent-subtle font-medium text-accent-subtle-fg" : "text-fg-muted hover:bg-surface-sunken",
              )}
            >
              {tabLabels[t]}
            </Link>
          ))}
        </nav>
        <Link
          href={href(query, { mine: !query.mine })}
          role="switch"
          aria-checked={query.mine}
          className="inline-flex items-center gap-2 rounded-full border border-line-strong px-3 py-1.5 text-sm text-fg hover:bg-surface-sunken"
        >
          <span aria-hidden="true" className={cn("h-3 w-3 rounded-full border border-line-strong", query.mine && "border-accent bg-accent")} />
          Assigned to me
        </Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No leads here"
          body={query.mine ? "Nothing assigned to you in this view. Turn off Assigned to me to see the whole agency." : "No leads in this view yet."}
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface-raised">
          <table className="w-full min-w-[820px] text-left text-sm">
            <caption className="sr-only">Leads, newest first</caption>
            <thead className="text-xs text-fg-subtle uppercase">
              <tr className="border-b border-line">
                <th scope="col" className="px-6 py-3 font-medium">Contact</th>
                <th scope="col" className="px-4 py-3 font-medium">Home</th>
                <th scope="col" className="px-4 py-3 font-medium">Viewing (Sylhet)</th>
                <th scope="col" className="px-4 py-3 font-medium">Source</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-6 py-3 font-medium">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-surface-sunken/60">
                  <td className="px-6 py-3.5">
                    <Link href={`/dashboard/leads/${row.id}`} className="font-medium text-fg hover:text-accent">
                      {row.contactName}
                    </Link>
                    <span className="flex items-center gap-1 text-xs text-fg-subtle tabular-nums">
                      {row.contactPhone ?? "No phone"}
                      {row.contactWhatsapp ? (
                        <>
                          <MessageCircle aria-hidden="true" className="h-3.5 w-3.5 text-success" />
                          <span className="sr-only">, on WhatsApp</span>
                        </>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-fg-muted">
                    {row.listing ? (
                      <>
                        {row.listing.title}
                        <span className="block text-xs text-fg-subtle">{row.listing.refCode}</span>
                      </>
                    ) : (
                      "General enquiry"
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    {row.viewing ? (
                      <span className="flex flex-col gap-1">
                        <span className="tabular-nums">{formatSylhet(row.viewing.start)}</span>
                        <ViewingStatusBadge status={row.viewing.status} />
                      </span>
                    ) : (
                      <span className="text-fg-subtle">None</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-fg-muted">{leadSourceLabels[row.source]}</td>
                  <td className="px-4 py-3.5">
                    <LeadStatusBadge status={row.status} />
                  </td>
                  <td className="px-6 py-3.5 text-fg-muted">{formatSylhetDate(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {query.cursor || nextCursor ? (
        <nav aria-label="Pages" className="flex justify-between">
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
