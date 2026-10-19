import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatSylhet } from "@/components/dashboard/lead-badges";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { requireAgent } from "@/lib/server/auth";
import { leadConversation } from "@/lib/server/lead-inbox";

export const metadata: Metadata = { title: "Chat transcript" };

// The visitor's chat, read only, reached only through their lead (spec 0002).
export default function LeadConversationPage({ params }: PageProps<"/dashboard/leads/[id]/conversation">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <Transcript params={params} />
    </Suspense>
  );
}

async function Transcript({ params }: { params: PageProps<"/dashboard/leads/[id]/conversation">["params"] }) {
  const { id } = await params;
  const agent = await requireAgent({ next: `/dashboard/leads/${id}/conversation` });
  const conversation = await leadConversation(id, agent);
  if (!conversation) notFound();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href={`/dashboard/leads/${id}`} className="text-sm text-fg-subtle hover:text-accent">
          Back to the lead
        </Link>
        <h1 className="mt-1 font-display text-3xl text-fg">Chat with {conversation.contactName}</h1>
        <p className="mt-1 text-sm text-fg-muted">Read only. {conversation.title ? `“${conversation.title}”` : ""}</p>
      </div>
      <ol className="flex flex-col gap-4">
        {conversation.messages.map((m) => (
          <li
            key={m.id}
            className={cn(
              "flex flex-col gap-1 rounded-2xl px-4 py-3 text-sm",
              m.role === "USER" ? "ml-auto max-w-xl bg-accent-subtle text-accent-subtle-fg" : m.role === "SYSTEM" ? "self-center text-xs text-fg-subtle" : "max-w-2xl bg-surface-raised text-fg",
            )}
          >
            <span className="text-xs opacity-70">
              {m.role === "USER" ? "Visitor" : m.role === "SYSTEM" ? "Note" : "Assistant"} · {formatSylhet(m.createdAt)}
            </span>
            {m.text ? <span className="whitespace-pre-wrap">{m.text}</span> : null}
            {m.shown.length > 0 ? <span className="text-xs text-fg-muted">Homes shown: {m.shown.join(", ")}</span> : null}
            {m.booked ? <span className="text-xs text-fg-muted">Viewing requested</span> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
