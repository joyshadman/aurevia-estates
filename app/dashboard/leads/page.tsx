import { CalendarClock, CircleCheck, Inbox, Search, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ViewingStateBadge } from "@/app/assistant/viewing-parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eyebrow } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/state";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { cn } from "@/lib/cn";
import { formatViewingTime } from "@/lib/domain/viewing-slots";
import { pluralize } from "@/lib/format";
import { requireAgent } from "@/lib/server/auth";
import { inboxTabs, listInbox, parseInboxQuery, type InboxQuery, type InboxTab } from "@/lib/server/lead-inbox";
import { countAssistantBookings } from "@/lib/server/metrics";
import { leadStatusBadge } from "./status";

export const metadata: Metadata = { title: "Leads" };

const path = "/dashboard/leads";

const tabLabels: Record<InboxTab, string> = {
  action: "Needs action",
  upcoming: "Upcoming",
  open: "Open",
  closed: "Closed",
};

// AC-3: an empty state that fits the tab.
const emptyStates: Record<InboxTab, { title: string; body: string; icon: typeof Inbox }> = {
  action: {
    title: "Nothing needs you right now",
    body: "New leads, unconfirmed viewings, and viewings whose time has passed show up here.",
    icon: CircleCheck,
  },
  upcoming: {
    title: "No confirmed viewings ahead",
    body: "Viewings you confirm with a buyer move here until their time comes.",
    icon: CalendarClock,
  },
  open: { title: "No open leads", body: "Viewing requests from the assistant land here as new leads.", icon: Inbox },
  closed: { title: "No closed leads yet", body: "Leads you mark Won or Lost are kept here.", icon: Users },
};

function href(query: InboxQuery, change: Partial<InboxQuery>) {
  const next = { ...query, page: 1, ...change };
  const params = new URLSearchParams();
  if (next.tab !== "action") params.set("tab", next.tab);
  if (next.q) params.set("q", next.q);
  if (!next.mine) params.set("mine", "0");
  if (next.page > 1) params.set("page", String(next.page));
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

// `/dashboard/leads` (spec 0009, AC-1 to AC-4): the agent's lead inbox, what
// needs action first, soonest viewing first. The agent landing page (spec 0004, AC-12).
export default function LeadsPage({ searchParams }: PageProps<"/dashboard/leads">) {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <Eyebrow>Agent dashboard</Eyebrow>
        <h1 className="mt-2 font-display text-3xl text-fg sm:text-4xl">Leads</h1>
        <p className="mt-2 max-w-2xl text-sm text-fg-muted">
          Viewing requests from the assistant and every enquiry, soonest viewing first. All times are Sylhet time.
        </p>
        <Suspense fallback={<Skeleton className="mt-4 h-5 w-72" />}>
          <AssistantBookings />
        </Suspense>
      </div>
      <Suspense fallback={<InboxSkeleton />}>
        <LeadsInbox searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

// Spec 0018, AC-3: the success metric, agency wide.
async function AssistantBookings() {
  const agent = await requireAgent({ next: path });
  const count = await countAssistantBookings(agent);
  return (
    <p className="mt-4 text-sm text-fg-muted">
      Booked through the assistant:{" "}
      <span className="font-medium text-fg tabular-nums">{count}</span> {pluralize(count, "viewing")} in the last 30 days
    </p>
  );
}

async function LeadsInbox({ searchParams }: Pick<PageProps<"/dashboard/leads">, "searchParams">) {
  const query = parseInboxQuery(await searchParams);
  const agent = await requireAgent({ next: href(query, { page: query.page }) });
  const { rows, counts, hasNext } = await listInbox(agent.id, query);
  const empty = emptyStates[query.tab];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Lead views" className="flex flex-wrap gap-1 rounded-full bg-surface-sunken p-1">
          {inboxTabs.map((tab) => {
            const current = query.tab === tab;
            return (
              <Link
                key={tab}
                href={href(query, { tab })}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-fast",
                  current ? "bg-surface-raised text-fg shadow-soft" : "text-fg-muted hover:text-fg",
                )}
              >
                {tabLabels[tab]}
                <span
                  className={cn(
                    "min-w-6 rounded-full px-1.5 text-center text-xs tabular-nums",
                    tab === "action" && counts.action > 0 ? "bg-accent text-on-accent" : "bg-surface-sunken text-fg-muted",
                  )}
                >
                  {counts[tab]}
                </span>
              </Link>
            );
          })}
        </nav>
        <div className="flex flex-wrap items-center gap-3">
          <form action={path} role="search" className="relative">
            {query.tab !== "action" ? <input type="hidden" name="tab" value={query.tab} /> : null}
            {query.mine ? null : <input type="hidden" name="mine" value="0" />}
            <label htmlFor="lead-search">
              <VisuallyHidden>Search by name, phone, or listing code</VisuallyHidden>
            </label>
            <Search
              aria-hidden="true"
              strokeWidth={1.5}
              className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-fg-subtle"
            />
            <Input
              id="lead-search"
              name="q"
              type="search"
              defaultValue={query.q}
              placeholder="Name, phone, or AUR-1042"
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
              className={cn("relative h-5 w-9 rounded-full transition-colors duration-fast", query.mine ? "bg-accent" : "bg-line-strong")}
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
      {query.mine ? (
        <p className="text-xs text-fg-subtle">Showing leads assigned to you and leads with no advisor yet.</p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          icon={query.q ? Search : empty.icon}
          title={query.q ? "No leads match that search" : empty.title}
          body={query.q ? "Try part of the name, at least 4 digits of the phone, or a listing code like AUR-1042." : empty.body}
          action={
            query.q ? (
              <Button href={href(query, { q: "" })} intent="secondary" size="sm">
                Clear search
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface-raised shadow-soft">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <caption className="sr-only">
              {tabLabels[query.tab]} leads, page {query.page}
            </caption>
            <thead className="border-b border-line text-xs tracking-wide text-fg-subtle uppercase">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Visitor</th>
                <th scope="col" className="px-4 py-3 font-medium">Home</th>
                <th scope="col" className="px-4 py-3 font-medium">Viewing</th>
                <th scope="col" className="px-4 py-3 font-medium">Lead</th>
                <th scope="col" className="px-4 py-3 font-medium">Advisor</th>
                <th scope="col" className="px-4 py-3 font-medium">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.id} className="align-top transition-colors duration-fast hover:bg-surface-sunken">
                  <td className="px-4 py-3">
                    <Link href={`${path}/${row.id}`} className="font-medium text-fg hover:text-accent">
                      {row.contactName}
                    </Link>
                    <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-fg-muted tabular-nums">
                      {row.contactPhone ?? "No phone"}
                      {row.contactWhatsapp ? (
                        <Badge tone="success" className="px-2 py-0.5">
                          WhatsApp
                        </Badge>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {row.listing ? (
                      <>
                        <span className="block text-fg">{row.listing.title}</span>
                        <span className="text-xs text-fg-muted">{row.listing.refCode}</span>
                      </>
                    ) : (
                      <span className="text-fg-muted">No home</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.viewing ? (
                      <span className="flex flex-col items-start gap-1">
                        <time dateTime={row.viewing.start} className="whitespace-nowrap text-fg">
                          {formatViewingTime(row.viewing.start)}
                        </time>
                        <ViewingStateBadge state={row.viewing.state} />
                      </span>
                    ) : (
                      <span className="text-fg-muted">No viewing</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={leadStatusBadge[row.status].tone}>{leadStatusBadge[row.status].label}</Badge>
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{row.advisor}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-fg-muted">
                    <time dateTime={row.receivedAt}>{formatViewingTime(row.receivedAt)}</time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {query.page > 1 || hasNext ? (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3">
          {query.page > 1 ? (
            <Button href={href(query, { page: query.page - 1 })} intent="ghost" size="sm">
              Previous page
            </Button>
          ) : (
            <span />
          )}
          <span className="text-sm text-fg-muted">Page {query.page}</span>
          {hasNext ? (
            <Button href={href(query, { page: query.page + 1 })} intent="secondary" size="sm">
              Next page
            </Button>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}

function InboxSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <span className="sr-only" role="status">
        Loading leads
      </span>
      <Skeleton className="h-11 w-full max-w-xl rounded-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
