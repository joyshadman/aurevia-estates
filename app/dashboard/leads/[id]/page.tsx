import {
  ArrowLeft,
  CalendarClock,
  ExternalLink,
  Mail,
  MessageCircle,
  MessageSquareText,
  NotebookPen,
  Phone,
  RefreshCw,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { ViewingStateBadge } from "@/app/assistant/viewing-parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { agentViewingDates, formatViewingTime } from "@/lib/domain/viewing-slots";
import type { LeadStatus } from "@/lib/generated/prisma/enums";
import { requireAgent } from "@/lib/server/auth";
import { getLeadDetail, type LeadActivityEntry, type LeadDetail } from "@/lib/server/lead-inbox";
import { statusBadge } from "../../listings/status";
import { leadStatusBadge, sourceLabels } from "../status";
import { AdvisorControls, CurrentViewingSummary, LeadStatusControls, NoteForm, ViewingControls } from "./lead-controls";
import { TranscriptView } from "./transcript";

export const metadata: Metadata = { title: "Lead" };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// `/dashboard/leads/[id]` (spec 0009, AC-5): everything an agent needs to call
// the buyer prepared, and every action on the lead and its viewings.
export default function LeadPage({ params }: PageProps<"/dashboard/leads/[id]">) {
  return (
    <Suspense fallback={<LeadSkeleton />}>
      <Lead params={params} />
    </Suspense>
  );
}

async function Lead({ params }: Pick<PageProps<"/dashboard/leads/[id]">, "params">) {
  const { id } = await params;
  const agent = await requireAgent({ next: `/dashboard/leads/${encodeURIComponent(id)}` });
  if (!uuidPattern.test(id)) notFound();
  const lead = await getLeadDetail(id);
  if (!lead) notFound();
  const dates = agentViewingDates();
  const leadOpen = lead.moves.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/dashboard/leads" className="flex items-center gap-2 self-start text-sm text-fg-muted hover:text-accent">
        <ArrowLeft aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
        All leads
      </Link>

      <ContactHeader lead={lead} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel icon={CalendarClock} title="Viewing" description="Times are Sylhet time. The buyer sees every change in their chat and on their account.">
            {lead.current ? (
              <div className="flex flex-col gap-4">
                <CurrentViewingSummary viewing={lead.current} />
                <ViewingControls key={lead.current.version} viewing={lead.current} dates={dates} />
              </div>
            ) : (
              <p className="rounded-2xl bg-surface-sunken p-5 text-sm text-fg-muted">
                No active viewing. A new booking from the buyer will appear here.
              </p>
            )}
            {lead.earlier.length > 0 ? <EarlierViewings viewings={lead.earlier} /> : null}
          </Panel>

          {lead.transcript ? (
            <Panel icon={MessageSquareText} title="Chat with the assistant" description="Read only. The buyer's own words and what the assistant showed them.">
              {lead.transcript.deleted ? (
                <p className="rounded-2xl bg-surface-sunken p-5 text-sm text-fg-muted">The visitor deleted this conversation.</p>
              ) : (
                <TranscriptView leadId={lead.id} initial={lead.transcript} />
              )}
            </Panel>
          ) : null}

          <Panel icon={NotebookPen} title="Activity" description="Notes, status changes, and viewing changes, newest first.">
            <NoteForm leadId={lead.id} />
            <ActivityList activities={lead.activities} />
          </Panel>
        </div>

        <aside className="flex flex-col gap-6 xl:sticky xl:top-24 xl:self-start">
          <Panel icon={Settings2} title="Lead status" compact>
            <div className="flex items-center gap-2">
              <Badge tone={leadStatusBadge[lead.status].tone}>{leadStatusBadge[lead.status].label}</Badge>
            </div>
            <LeadStatusControls key={lead.status} leadId={lead.id} status={lead.status} moves={lead.moves} />
          </Panel>

          <Panel title="Advisor" compact>
            <p className="text-sm text-fg">{lead.advisor?.name ?? "Unassigned"}</p>
            {leadOpen ? (
              <AdvisorControls key={lead.advisor?.id ?? "none"} leadId={lead.id} advisor={lead.advisor} agents={lead.agents} me={agent.id} />
            ) : (
              <p className="text-xs text-fg-subtle">A closed lead keeps its advisor.</p>
            )}
          </Panel>

          <Panel title="Home" compact>
            {lead.listing ? (
              <div className="flex flex-col gap-3">
                <div>
                  <p className="font-medium text-fg">{lead.listing.title}</p>
                  <p className="text-sm text-fg-muted">{lead.listing.refCode}</p>
                </div>
                <Badge tone={statusBadge[lead.listing.status].tone} className="self-start">
                  {statusBadge[lead.listing.status].label}
                </Badge>
                <Button href={`/dashboard/listings/${lead.listing.id}`} intent="secondary" size="sm" className="self-start">
                  Open listing
                  <ExternalLink aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <p className="text-sm text-fg-muted">This lead isn&apos;t about a specific home.</p>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function ContactHeader({ lead }: { lead: LeadDetail }) {
  const { contact } = lead;
  const digits = contact.phone?.replace(/\D/g, "") ?? "";
  return (
    <header className="flex flex-col gap-5 rounded-3xl border border-line bg-surface-raised p-6 shadow-soft sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Eyebrow>{sourceLabels[lead.source]}</Eyebrow>
          <h1 className="mt-2 font-display text-3xl text-fg sm:text-4xl">{contact.name}</h1>
          <p className="mt-2 text-sm text-fg-muted">
            Received <time dateTime={lead.receivedAt}>{formatViewingTime(lead.receivedAt)}</time>
          </p>
        </div>
        <Badge tone={leadStatusBadge[lead.status].tone}>{leadStatusBadge[lead.status].label}</Badge>
      </div>
      <dl className="grid gap-4 border-t border-line pt-5 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs tracking-wide text-fg-subtle uppercase">Phone</dt>
          <dd className="mt-1 text-fg tabular-nums">{contact.phone ?? "Not given"}</dd>
        </div>
        <div>
          <dt className="text-xs tracking-wide text-fg-subtle uppercase">Email</dt>
          <dd className="mt-1 break-all text-fg">{contact.email ?? "Not given"}</dd>
        </div>
        <div>
          <dt className="text-xs tracking-wide text-fg-subtle uppercase">WhatsApp</dt>
          <dd className="mt-1 text-fg">{contact.whatsapp ? "Yes, on this number" : "Not on this number"}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-3">
        {contact.phone ? (
          <Button href={`tel:${contact.phone}`}>
            <Phone aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
            Call {contact.phone}
          </Button>
        ) : null}
        {contact.whatsapp && digits ? (
          <Button href={`https://wa.me/${digits}`} intent="secondary" target="_blank">
            <MessageCircle aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
            WhatsApp
          </Button>
        ) : null}
        {contact.email ? (
          <Button href={`mailto:${contact.email}`} intent="ghost">
            <Mail aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
            Email
          </Button>
        ) : null}
      </div>
    </header>
  );
}

function EarlierViewings({ viewings }: { viewings: LeadDetail["earlier"] }) {
  return (
    <div className="border-t border-line pt-5">
      <h3 className="text-sm font-medium text-fg">Earlier viewings</h3>
      <ul className="mt-3 divide-y divide-line">
        {viewings.map((viewing) => (
          <li key={viewing.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div>
              <time dateTime={viewing.start} className="text-sm text-fg">
                {formatViewingTime(viewing.start)}
              </time>
              {viewing.cancelReason ? <p className="mt-0.5 text-xs text-fg-muted">{viewing.cancelReason}</p> : null}
            </div>
            <ViewingStateBadge state={viewing.state} />
          </li>
        ))}
      </ul>
    </div>
  );
}

const leadLabel = (status: string | null) => leadStatusBadge[status as LeadStatus]?.label ?? status ?? "";

// One line per activity, in words (AC-5).
function activityTitle(activity: LeadActivityEntry): string {
  switch (activity.type) {
    case "NOTE":
      return "Note";
    case "SYSTEM":
      return "Update";
    case "STATUS_CHANGE":
      return `Lead moved from ${leadLabel(activity.fromStatus)} to ${leadLabel(activity.toStatus)}`;
    case "VIEWING_CHANGE":
      if (activity.fromStatus === "CONFIRMED" && activity.toStatus === "CONFIRMED") return "Viewing time changed";
      return (
        {
          REQUESTED: "Viewing requested",
          CONFIRMED: "Viewing confirmed",
          CANCELLED: "Viewing cancelled",
          COMPLETED: "Viewing completed",
          NO_SHOW: "Marked as no show",
        }[activity.toStatus ?? ""] ?? "Viewing updated"
      );
  }
}

const activityIcons = {
  NOTE: NotebookPen,
  SYSTEM: RefreshCw,
  STATUS_CHANGE: Settings2,
  VIEWING_CHANGE: CalendarClock,
} as const;

function ActivityList({ activities }: { activities: LeadActivityEntry[] }) {
  if (activities.length === 0) return <p className="text-sm text-fg-muted">No activity yet.</p>;
  return (
    <ol className="flex flex-col border-t border-line pt-2">
      {activities.map((activity) => {
        const Icon = activityIcons[activity.type];
        return (
          <li key={activity.id} className="flex gap-3 py-3">
            <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-sunken text-fg-muted">
              <Icon strokeWidth={1.5} className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-fg">
                <span className="font-medium">{activityTitle(activity)}</span>
              </p>
              {activity.body ? <p className="mt-1 text-sm break-words whitespace-pre-wrap text-fg-muted">{activity.body}</p> : null}
              <p className="mt-1 text-xs text-fg-subtle">
                {activity.actorName} · <time dateTime={activity.at}>{formatViewingTime(activity.at)}</time>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Panel({
  icon: Icon,
  title,
  description,
  compact = false,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex flex-col gap-4 rounded-3xl border border-line bg-surface-raised p-6 shadow-soft", !compact && "sm:p-8")}>
      <div>
        <h2 className="flex items-center gap-2 font-display text-xl text-fg">
          {Icon ? <Icon aria-hidden="true" strokeWidth={1.5} className="h-5 w-5 text-secondary" /> : null}
          {title}
        </h2>
        {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function LeadSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <span className="sr-only" role="status">
        Loading lead
      </span>
      <Skeleton className="h-48 w-full" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Skeleton className="h-[32rem] w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    </div>
  );
}
