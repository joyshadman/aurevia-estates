"use client";

import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Menu, MenuItem } from "@/components/ui/menu";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { replyLocale } from "@/lib/domain/bangla";
import { formatChatDate } from "@/lib/format";
import type { ConversationRow } from "@/lib/server/conversations";
import { deleteConversation, listConversations, renameConversation } from "./actions";
import { chatEditMessages, conversationTitleMessage } from "./messages";

const maxTitleLength = 60;

// The visitor's conversations (spec 0006, AC-11): newest first, 20 at a time,
// with rename and delete. The list state lives in `useConversations`, so the
// desktop pane and the mobile drawer show the same rows.

export type ConversationList = {
  rows: ConversationRow[];
  nextCursor: string | null;
  loadingMore: boolean;
  loadMore: () => Promise<void>;
  upsert: (row: ConversationRow) => void;
  rename: (id: string, title: string) => void;
  remove: (id: string) => void;
};

export function useConversations(initial: { rows: ConversationRow[]; nextCursor: string | null }): ConversationList {
  const [rows, setRows] = useState(initial.rows);
  const [nextCursor, setNextCursor] = useState(initial.nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);

  return {
    rows,
    nextCursor,
    loadingMore,
    loadMore: async () => {
      if (!nextCursor || loadingMore) return;
      setLoadingMore(true);
      const result = await listConversations({ cursor: nextCursor });
      setLoadingMore(false);
      if (!result.ok) {
        toast({ tone: "danger", title: chatEditMessages[result.reason] });
        return;
      }
      setRows((current) => [...current, ...result.rows.filter((row) => !current.some((known) => known.id === row.id))]);
      setNextCursor(result.nextCursor);
    },
    // A new or just used conversation moves to the top, as the server orders it.
    upsert: (row) =>
      setRows((current) => {
        const known = current.find((candidate) => candidate.id === row.id);
        return [{ ...row, title: known?.title ?? row.title }, ...current.filter((candidate) => candidate.id !== row.id)];
      }),
    rename: (id, title) => setRows((current) => current.map((row) => (row.id === id ? { ...row, title } : row))),
    remove: (id) => setRows((current) => current.filter((row) => row.id !== id)),
  };
}

export function ConversationsPane({
  list,
  currentId,
  busy,
  onNewChat,
  onNavigate,
  onDeleted,
}: {
  list: ConversationList;
  currentId: string | undefined;
  // A reply is streaming in the open conversation: it can't be deleted yet.
  busy: boolean;
  onNewChat: () => void;
  // Called before a link navigates (closes the mobile drawer).
  onNavigate?: () => void;
  onDeleted: (id: string) => void;
}) {
  const [renaming, setRenaming] = useState<ConversationRow | null>(null);
  const [deleting, setDeleting] = useState<ConversationRow | null>(null);

  return (
    <nav aria-label="Conversations" className="flex flex-col gap-6">
      <Button type="button" intent="secondary" className="w-full" onClick={onNewChat}>
        <Plus aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
        New conversation
      </Button>

      <div>
        <h2 className="px-3 text-xs font-medium tracking-[.18em] text-fg-subtle uppercase">Recent</h2>
        {list.rows.length === 0 ? (
          <p className="mt-3 px-3 text-sm text-fg-muted">Your conversations appear here once you send a message.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {list.rows.map((row) => {
              const title = row.title ?? "New conversation";
              const current = row.id === currentId;
              return (
                <li key={row.id} className="group relative">
                  <Link
                    href={`/assistant/c/${row.id}`}
                    aria-current={current ? "page" : undefined}
                    onClick={onNavigate}
                    className={cn(
                      "block rounded-xl py-2.5 pr-12 pl-3 text-sm transition-colors duration-fast",
                      current ? "bg-surface-raised font-medium text-fg shadow-soft" : "text-fg-muted hover:bg-surface-raised hover:text-fg",
                    )}
                  >
                    <span lang={replyLocale(title, "en") === "bn" ? "bn" : undefined} className="block truncate">
                      {title}
                    </span>
                    <time dateTime={row.lastMessageAt} suppressHydrationWarning className="block text-xs font-normal text-fg-subtle">
                      {formatChatDate(row.lastMessageAt)}
                    </time>
                  </Link>
                  <div className="absolute top-1/2 right-1.5 -translate-y-1/2">
                    <Menu
                      label={`Options for ${title}`}
                      trigger={<MoreHorizontal aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />}
                      triggerClassName="grid h-9 w-9 place-items-center rounded-full text-fg-subtle hover:bg-surface-sunken hover:text-fg"
                    >
                      <MenuItem onSelect={() => setRenaming(row)}>
                        <Pencil aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
                        Rename
                      </MenuItem>
                      <MenuItem onSelect={() => setDeleting(row)}>
                        <Trash2 aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
                        Delete
                      </MenuItem>
                    </Menu>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {list.nextCursor ? (
          <Button
            type="button"
            intent="ghost"
            size="sm"
            className="mt-2 w-full"
            loading={list.loadingMore}
            onClick={() => void list.loadMore()}
          >
            Load more
          </Button>
        ) : null}
      </div>

      <RenameDialog
        row={renaming}
        onClose={() => setRenaming(null)}
        onRenamed={(id, title) => {
          list.rename(id, title);
          setRenaming(null);
        }}
      />
      <DeleteDialog
        row={deleting}
        blocked={busy && deleting?.id === currentId}
        onClose={() => setDeleting(null)}
        onDeleted={(id) => {
          setDeleting(null);
          list.remove(id);
          onDeleted(id);
        }}
      />
    </nav>
  );
}

function RenameDialog({
  row,
  onClose,
  onRenamed,
}: {
  row: ConversationRow | null;
  onClose: () => void;
  onRenamed: (id: string, title: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [openFor, setOpenFor] = useState<string | null>(null);
  // Fill the field each time the dialog opens for a conversation.
  if (row && openFor !== row.id) {
    setOpenFor(row.id);
    setTitle(row.title ?? "");
    setSubmitted(false);
  } else if (!row && openFor !== null) {
    setOpenFor(null);
  }

  const trimmed = title.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= maxTitleLength;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    if (!row || !valid || pending) return;
    setPending(true);
    const result = await renameConversation({ id: row.id, title: trimmed });
    setPending(false);
    if (result.ok) onRenamed(row.id, result.title);
    else toast({ tone: "danger", title: result.reason === "invalid" ? conversationTitleMessage : chatEditMessages[result.reason] });
  };

  return (
    <Dialog
      open={row !== null}
      onClose={onClose}
      title="Rename conversation"
      footer={
        <>
          <Button type="button" intent="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="rename-conversation" loading={pending}>
            Save
          </Button>
        </>
      }
    >
      <form id="rename-conversation" noValidate onSubmit={onSubmit}>
        <Field id="conversation-title" label="Title" error={conversationTitleMessage} showError={submitted && !valid}>
          <Input value={title} maxLength={maxTitleLength} onChange={(event) => setTitle(event.target.value)} autoComplete="off" />
        </Field>
      </form>
    </Dialog>
  );
}

function DeleteDialog({
  row,
  blocked,
  onClose,
  onDeleted,
}: {
  row: ConversationRow | null;
  blocked: boolean;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [pending, setPending] = useState(false);

  const confirm = async () => {
    if (!row || pending) return;
    setPending(true);
    const result = await deleteConversation({ id: row.id });
    setPending(false);
    if (result.ok) onDeleted(row.id);
    else toast({ tone: "danger", title: chatEditMessages[result.reason] });
  };

  return (
    <Dialog
      open={row !== null}
      onClose={onClose}
      title="Delete this conversation?"
      description="Its messages, brief, and recommended homes are removed for good. Viewings you booked from it stay booked."
      footer={
        <>
          <Button type="button" intent="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" intent="danger" loading={pending} disabled={blocked} onClick={() => void confirm()}>
            Delete
          </Button>
        </>
      }
    >
      <p className="text-sm text-fg-muted">
        {blocked ? "The assistant is still answering here. Wait for the reply, then delete it." : (row?.title ?? "New conversation")}
      </p>
    </Dialog>
  );
}
