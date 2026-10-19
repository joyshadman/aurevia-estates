"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import type { ConversationRow } from "@/lib/server/conversations";
import { deleteConversationAction, listConversationsAction, renameConversationAction } from "@/app/assistant/actions";

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Dhaka" });

const failures: Record<string, string> = {
  not_found: "That conversation no longer exists.",
  invalid: "Use 1 to 60 characters.",
  turn_in_progress: "Wait for the reply to finish first.",
  signed_out: "Your session ended. Sign in again.",
};

// The visitor's conversations, newest first, 20 at a time (spec 0006, AC-11).
export function ConversationList({
  initial,
  activeId,
  onChanged,
}: {
  initial: { rows: ConversationRow[]; nextCursor: string | null };
  activeId: string | null;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial.rows);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [deleting, setDeleting] = useState<ConversationRow | null>(null);
  const [pending, startTransition] = useTransition();

  // A new first page from the parent (after a reply) replaces the loaded rows.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setRows(initial.rows);
    setCursor(initial.nextCursor);
  }

  function loadMore() {
    if (!cursor) return;
    startTransition(async () => {
      const next = await listConversationsAction(cursor);
      setRows((current) => [...current, ...next.rows.filter((r) => !current.some((c) => c.id === r.id))]);
      setCursor(next.nextCursor);
    });
  }

  function rename(id: string) {
    startTransition(async () => {
      const result = await renameConversationAction({ id, title });
      if (!result.ok) {
        toast({ tone: "danger", title: failures[result.reason] ?? "Something went wrong." });
        return;
      }
      setRows((current) => current.map((r) => (r.id === id ? { ...r, title: title.trim() } : r)));
      setEditing(null);
      onChanged?.();
    });
  }

  function remove() {
    const target = deleting;
    if (!target) return;
    startTransition(async () => {
      const result = await deleteConversationAction({ id: target.id });
      setDeleting(null);
      if (!result.ok) {
        toast({ tone: "danger", title: failures[result.reason] ?? "Something went wrong." });
        return;
      }
      setRows((current) => current.filter((r) => r.id !== target.id));
      toast({ tone: "success", title: "Conversation deleted" });
      if (target.id === activeId) router.push("/assistant");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Button href="/assistant" intent="secondary" size="sm" className="self-start">
        <Plus aria-hidden="true" className="h-4 w-4" />
        New chat
      </Button>
      {rows.length === 0 ? <p className="text-sm text-fg-muted">Your conversations appear here.</p> : null}
      <ul className="flex flex-col gap-1">
        {rows.map((row) => (
          <li key={row.id} className={cn("group rounded-xl", row.id === activeId && "bg-accent-subtle")}>
            {editing === row.id ? (
              <form
                className="flex gap-2 p-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  rename(row.id);
                }}
              >
                <label htmlFor={`rename-${row.id}`} className="sr-only">
                  New title
                </label>
                <Input
                  id={`rename-${row.id}`}
                  value={title}
                  maxLength={60}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                  className="h-9"
                />
                <Button type="submit" size="sm" loading={pending}>
                  Save
                </Button>
              </form>
            ) : (
              <div className="flex items-center gap-1 pr-1">
                <Link
                  href={`/assistant/c/${row.id}`}
                  aria-current={row.id === activeId ? "page" : undefined}
                  className={cn(
                    "min-w-0 flex-1 rounded-xl px-3 py-2 text-sm",
                    row.id === activeId ? "font-medium text-accent-subtle-fg" : "text-fg hover:bg-surface-sunken",
                  )}
                >
                  <span className="block truncate">{row.title}</span>
                  <span className="block text-xs text-fg-subtle">{dateFormat.format(new Date(row.lastMessageAt))}</span>
                </Link>
                <Button
                  size="sm"
                  intent="ghost"
                  icon
                  aria-label={`Rename ${row.title}`}
                  onClick={() => {
                    setEditing(row.id);
                    setTitle(row.title);
                  }}
                >
                  <Pencil aria-hidden="true" className="h-4 w-4" />
                </Button>
                <Button size="sm" intent="ghost" icon aria-label={`Delete ${row.title}`} onClick={() => setDeleting(row)}>
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {cursor ? (
        <Button intent="ghost" size="sm" onClick={loadMore} loading={pending}>
          Load more
        </Button>
      ) : null}
      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this conversation?"
        description="Its messages and brief are removed for good. Viewings you booked from it stay booked."
        footer={
          <>
            <Button intent="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button intent="danger" onClick={remove} loading={pending}>
              Delete
            </Button>
          </>
        }
      />
    </div>
  );
}
