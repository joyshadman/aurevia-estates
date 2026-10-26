import { CalendarClock, Inbox } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { ViewingStateBadge } from "@/app/assistant/viewing-parts";
import { Eyebrow } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/state";
import { DHAKA_TIME_ZONE, formatViewingTime } from "@/lib/domain/viewing-slots";
import { pluralize } from "@/lib/format";
import { requireAgent } from "@/lib/server/auth";
import { agentOverview, type Overview } from "@/lib/server/dashboard-overview";
import { countAssistantBookings } from "@/lib/server/metrics";
import { leadStatusBadge } from "./leads/status";

export const metadata: Metadata = { title: "Overview" };

// `/dashboard` (spec 0022): the agent's week at a glance, and where agents land
// on sign in. Everything here is the signed in agent's assigned leads.
export default function OverviewPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <Eyebrow>Agent dashboard</Eyebrow>
        <h1 className="mt-2 font-display text-3xl text-fg sm:text-4xl">Overview</h1>
        <p className="mt-2 max-w-2xl text-sm text-fg-muted">Your leads and viewings. All times are Sylhet time.</p>
      </div>
      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewContent />
      </Suspense>
    </div>
  );
}

async function OverviewContent() {
  const agent = await requireAgent({ next: "/dashboard" });
  const [overview, assistantBookings] = await Promise.all([agentOverview(agent), countAssistantBookings(agent)]);
  const thisWeek = overview.weeks.at(-1)?.count ?? 0;
  const lastWeek = overview.weeks.at(-2)?.count ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="New leads, last 7 days" value={thisWeek} note={`${lastWeek} the 7 days before`} />
        <StatTile label="Leads, last 30 days" value={overview.pipelineTotal} note="Created in the last 30 days" />
        <StatTile label="Booked through the assistant" value={assistantBookings} note="Whole agency, last 30 days" />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Weekly new leads" description="Each bar is 7 days; the last one ends now.">
          <WeeklyBars weeks={overview.weeks} />
        </Card>
        <Card title="30 day pipeline" description="Leads from the last 30 days, by where they are now.">
          <Pipeline rows={overview.pipeline} total={overview.pipelineTotal} />
        </Card>
      </div>
      <Card title="Upcoming viewings" description="The next five, soonest first.">
        <Upcoming rows={overview.upcoming} />
      </Card>
    </div>
  );
}

function Card({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-line bg-surface-raised p-6 shadow-soft">
      <h2 className="font-display text-xl text-fg">{title}</h2>
      <p className="mt-1 text-sm text-fg-muted">{description}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

// A headline number (AC-2).
function StatTile({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="rounded-3xl border border-line bg-surface-raised p-6 shadow-soft">
      <p className="text-sm text-fg-muted">{label}</p>
      <p className="mt-2 font-display text-4xl text-fg tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-fg-subtle">{note}</p>
    </div>
  );
}

const weekLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: DHAKA_TIME_ZONE, day: "numeric", month: "short" }).format(new Date(iso));

// AC-2, AC-5: one series, so one color; each bar names its week and count on
// hover, and a table carries the same numbers for screen readers.
function WeeklyBars({ weeks }: { weeks: Overview["weeks"] }) {
  const max = Math.max(...weeks.map((week) => week.count));
  if (max === 0) return <EmptyState icon={Inbox} title="No leads in the last 8 weeks" body="New leads assigned to you will show here." />;

  return (
    <>
      <div aria-hidden="true" className="flex h-40 items-end gap-2 border-b border-line">
        {weeks.map((week) => (
          <div key={week.end} className="group relative flex h-full flex-1 items-end" title={`${weekLabel(week.end)}: ${week.count} ${pluralize(week.count, "lead")}`}>
            <div
              className="w-full rounded-t bg-accent transition-colors duration-fast group-hover:bg-accent-hover"
              style={{ height: week.count === 0 ? "2px" : `${(week.count / max) * 100}%` }}
            />
            <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 rounded bg-fg px-1.5 py-0.5 text-xs text-surface tabular-nums group-hover:block">
              {week.count}
            </span>
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="mt-2 flex gap-2 text-xs text-fg-subtle">
        {weeks.map((week, index) => (
          <span key={week.end} className="flex-1 text-center">
            {index % 2 === 1 || index === weeks.length - 1 ? weekLabel(week.end) : ""}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>New leads per week, oldest first</caption>
        <tbody>
          {weeks.map((week) => (
            <tr key={week.end}>
              <th scope="row">Week ending {weekLabel(week.end)}</th>
              <td>{week.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// AC-3: counts by current status; the bars share one scale, the total.
function Pipeline({ rows, total }: { rows: Overview["pipeline"]; total: number }) {
  if (total === 0) return <EmptyState icon={Inbox} title="No leads in the last 30 days" body="Leads assigned to you will show here." />;
  return (
    <dl className="flex flex-col gap-3">
      {rows.map((row) => (
        <div key={row.status} className="grid grid-cols-[6rem_minmax(0,1fr)_2.5rem] items-center gap-3">
          <dt className="text-sm text-fg">{leadStatusBadge[row.status].label}</dt>
          <div aria-hidden="true" className="h-2.5 rounded-full bg-surface-sunken">
            <div className="h-full rounded-full bg-accent" style={{ width: `${(row.count / total) * 100}%` }} />
          </div>
          <dd className="text-right text-sm text-fg tabular-nums">{row.count}</dd>
        </div>
      ))}
      <div className="flex justify-between border-t border-line pt-3 text-sm text-fg-muted">
        <span>Total</span>
        <span className="tabular-nums">{total}</span>
      </div>
    </dl>
  );
}

// AC-4.
function Upcoming({ rows }: { rows: Overview["upcoming"] }) {
  if (rows.length === 0) {
    return <EmptyState icon={CalendarClock} title="No viewings ahead" body="Requested and confirmed viewings on your leads show here." />;
  }
  return (
    <ul className="divide-y divide-line">
      {rows.map((row) => (
        <li key={row.viewingId}>
          <Link
            href={`/dashboard/leads/${row.leadId}`}
            className="flex flex-wrap items-center justify-between gap-3 py-3 hover:text-accent"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-fg">{row.title ?? "Home removed"}</p>
              <p className="text-xs text-fg-muted">
                {row.visitor}
                {row.refCode ? ` · ${row.refCode}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-fg tabular-nums">{formatViewingTime(row.start)}</span>
              <ViewingStateBadge state={row.status} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
