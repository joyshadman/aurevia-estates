import { ExternalLink, MessageCircle, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatSylhet, LeadStatusBadge, leadSourceLabels, ViewingStatusBadge } from "@/components/dashboard/lead-badges";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { requireAgent } from "@/lib/server/auth";
import { getLeadDetail } from "@/lib/server/lead-inbox";
import { LeadActions } from "./lead-actions";

export const metadata: Metadata = { title: "Lead" };

export default function LeadPage({ params }: PageProps<"/dashboard/leads/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[560px] w-full rounded-2xl" />}>
      <Lead params={params} />
    </Suspense>
  );
}

const activityText: Record<string, string> = {
  NOTE: "Note",
  STATUS_CHANGE: "Status",
  VIEWING_CHANGE: "Viewing",
  SYSTEM: "System",
};

async function Lead({ params }: { params: PageProps<"/dashboard/leads/[id]">["params"] }) {
  const { id } = await params;
  const agent = await requireAgent({ next: `/dashboard/leads/${id}` });
  const lead = await getLeadDetail(id, agent);
  if (!lead) notFound();
  const whatsappNumber = lead.contact.phone?.replace(/^\+/, "");

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <div>
          <Link href="/dashboard/leads" className="text-sm text-fg-subtle hover:text-accent">
            Leads
          </Link>
          <h1 className="mt-1 font-display text-3xl text-fg">{lead.contact.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
            <LeadStatusBadge status={lead.status} />
            <span>{leadSourceLabels[lead.source]}</span>
            <span aria-hidden="true">·</span>
            <span>Received {formatSylhet(lead.createdAt)}</span>
          </div>
        </div>

        <section aria-labelledby="contact" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface-raised p-6">
          <h2 id="contact" className="font-display text-xl text-fg">Contact</h2>
          {lead.anonymized ? <p className="text-sm text-fg-muted">This visitor deleted their account; their contact details were removed.</p> : null}
          <div className="flex flex-wrap gap-3">
            {lead.contact.phone ? (
              <a href={`tel:${lead.contact.phone}`} className="inline-flex items-center gap-2 rounded-full border border-line-strong px-4 py-2 text-sm text-fg hover:bg-surface-sunken">
                <Phone aria-hidden="true" className="h-4 w-4" />
                <span className="tabular-nums">{lead.contact.phone}</span>
              </a>
            ) : null}
            {lead.contact.whatsapp && whatsappNumber ? (
              <a
                href={`https://wa.me/${whatsappNumber}`}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-2 rounded-full border border-line-strong px-4 py-2 text-sm text-fg hover:bg-surface-sunken"
              >
                <MessageCircle aria-hidden="true" className="h-4 w-4 text-success" />
                WhatsApp
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : null}
            {lead.contact.email ? (
              <a href={`mailto:${lead.contact.email}`} className="inline-flex items-center rounded-full border border-line-strong px-4 py-2 text-sm text-fg hover:bg-surface-sunken">
                {lead.contact.email}
              </a>
            ) : null}
          </div>
          {lead.message ? (
            <blockquote className="rounded-xl bg-surface-sunken px-4 py-3 text-sm whitespace-pre-wrap text-fg">{lead.message}</blockquote>
          ) : null}
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-fg-subtle">Home</dt>
              <dd className="text-fg">
                {lead.listing ? (
                  <Link href={`/dashboard/listings/${lead.listing.id}`} className="hover:text-accent">
                    {lead.listing.title} ({lead.listing.refCode})
                  </Link>
                ) : (
                  "General enquiry"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-fg-subtle">Advisor</dt>
              <dd className="text-fg">{lead.advisor?.name ?? "Unassigned"}</dd>
            </div>
          </dl>
          {lead.hasConversation ? (
            <Link href={`/dashboard/leads/${lead.id}/conversation`} className="inline-flex items-center gap-1 self-start text-sm text-accent hover:underline">
              Read the chat
              <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </section>

        <section aria-labelledby="viewings" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface-raised p-6">
          <h2 id="viewings" className="font-display text-xl text-fg">Viewings</h2>
          {lead.viewings.length === 0 ? <p className="text-sm text-fg-muted">No viewings on this lead.</p> : null}
          <ul className="flex flex-col divide-y divide-line">
            {lead.viewings.map((v) => (
              <li key={v.id} className={cn("flex flex-wrap items-center gap-3 py-3 text-sm", v.id === lead.currentViewingId && "font-medium")}>
                <ViewingStatusBadge status={v.status} />
                <span className="tabular-nums text-fg">{formatSylhet(v.confirmedFor ?? v.requestedFor)} Sylhet</span>
                {v.confirmedFor && v.confirmedFor !== v.requestedFor ? (
                  <span className="text-xs text-fg-subtle">requested {formatSylhet(v.requestedFor)}</span>
                ) : null}
                {v.cancelReason ? <span className="text-xs text-fg-subtle">{v.cancelReason}</span> : null}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="history" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface-raised p-6">
          <h2 id="history" className="font-display text-xl text-fg">History</h2>
          <ol className="flex flex-col gap-3">
            {lead.activities.map((a) => (
              <li key={a.id} className="text-sm">
                <span className="text-xs text-fg-subtle">
                  {formatSylhet(a.createdAt)} · {activityText[a.type]} · {a.actor}
                </span>
                <p className="text-fg">
                  {a.fromStatus || a.toStatus ? `${a.fromStatus ?? "…"} → ${a.toStatus ?? "…"}` : null}
                  {(a.fromStatus || a.toStatus) && a.body ? ": " : null}
                  {a.body}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <aside className="flex flex-col gap-5 rounded-2xl border border-line bg-surface-raised p-6 lg:sticky lg:top-24 lg:w-80">
        <LeadActions
          leadId={lead.id}
          status={lead.status}
          unassigned={lead.advisor === null}
          viewing={lead.viewings.find((v) => v.id === lead.currentViewingId) ?? null}
        />
      </aside>
    </div>
  );
}
