"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { listingFailureMessage, type ListingActionResult } from "@/lib/domain/listing-messages";
import type { ListingStatus } from "@/lib/generated/prisma/enums";
import { deleteDraftAction, markSoldAction, reassignAction, unpublishAction } from "../actions";
import { useEditor } from "./editor-context";

// Unpublish, Mark sold, Delete, and Reassign, each behind a confirm dialog
// (spec 0005, AC-10, AC-11). Publish lives with Save, since it saves the form.

type Pending = "unpublish" | "sold" | "delete" | "reassign" | null;

const copy = {
  unpublish: {
    title: "Unpublish this listing?",
    body: "It leaves search, the assistant, and the sitemap at once. You can publish it again later.",
    confirm: "Unpublish",
  },
  sold: {
    title: "Mark this listing sold?",
    body: "It leaves search and the assistant, and the form becomes read only. Its page stays up with a Sold badge. This can't be undone.",
    confirm: "Mark sold",
  },
  delete: {
    title: "Delete this draft?",
    body: "The draft, its photos, and its amenities are removed for good.",
    confirm: "Delete draft",
  },
  reassign: {
    title: "Hand over this listing?",
    body: "The new advisor gets the listing and its open leads. If you didn't create it, you can no longer edit it.",
    confirm: "Hand over",
  },
} as const;

export function LifecycleActions({
  listingId,
  status,
  assignedAgentId,
  agents,
}: {
  listingId: string;
  status: ListingStatus;
  assignedAgentId: string | null;
  agents: { id: string; fullName: string }[];
}) {
  const { token, canEdit, settle } = useEditor();
  const [open, setOpen] = useState<Pending>(null);
  const [agentId, setAgentId] = useState(assignedAgentId ?? "");
  const [pending, startTransition] = useTransition();

  if (!canEdit) return null;

  function confirm() {
    const action = open;
    startTransition(async () => {
      let result: ListingActionResult;
      if (action === "unpublish") result = await unpublishAction({ id: listingId, expectedUpdatedAt: token });
      else if (action === "sold") result = await markSoldAction({ id: listingId, expectedUpdatedAt: token });
      else if (action === "reassign") result = await reassignAction({ id: listingId, expectedUpdatedAt: token, agentId });
      else if (action === "delete") {
        // Redirects to the list on success; only a failure comes back.
        const failure = await deleteDraftAction({ id: listingId });
        toast({ tone: "danger", title: listingFailureMessage(failure) });
        setOpen(null);
        return;
      } else return;
      const moved = action === "reassign" && result.ok ? (result as { movedLeads?: number }).movedLeads : undefined;
      settle(result, action === "reassign" ? `Handed over${moved ? ` with ${moved} open lead${moved === 1 ? "" : "s"}` : ""}` : "Done");
      setOpen(null);
    });
  }

  const dialog = open ? copy[open] : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {status === "PUBLISHED" ? (
          <Button intent="secondary" size="sm" onClick={() => setOpen("unpublish")}>
            Unpublish
          </Button>
        ) : null}
        {status === "PUBLISHED" || status === "UNPUBLISHED" ? (
          <Button intent="secondary" size="sm" onClick={() => setOpen("sold")}>
            Mark sold
          </Button>
        ) : null}
        {status === "DRAFT" ? (
          <Button intent="danger" size="sm" onClick={() => setOpen("delete")}>
            Delete draft
          </Button>
        ) : null}
      </div>

      <div className="flex items-end gap-2">
        <Field id="reassign-agent" label="Advisor" className="flex-1">
          <Select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            {assignedAgentId ? null : <option value="">Unassigned</option>}
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.fullName}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          intent="secondary"
          size="md"
          disabled={!agentId || agentId === assignedAgentId}
          onClick={() => setOpen("reassign")}
        >
          Hand over
        </Button>
      </div>

      <Dialog
        open={dialog !== null}
        onClose={() => setOpen(null)}
        title={dialog?.title ?? ""}
        description={dialog?.body}
        footer={
          <>
            <Button intent="ghost" onClick={() => setOpen(null)} disabled={pending}>
              Cancel
            </Button>
            <Button intent={open === "delete" ? "danger" : "primary"} onClick={confirm} loading={pending}>
              {dialog?.confirm}
            </Button>
          </>
        }
      />
    </div>
  );
}
