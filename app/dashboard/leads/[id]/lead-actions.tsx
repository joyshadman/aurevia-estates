"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import type { LeadStatus, ViewingStatus } from "@/lib/generated/prisma/enums";
import { addLeadNoteAction, changeLeadStatusAction, changeViewingAction, takeLeadAction } from "../actions";

// What an agent records after calling (spec 0008, assumed): lead status,
// the current viewing, notes, and taking an unassigned lead.

const messages: Record<string, string> = {
  stale_status: "This lead just changed. Refresh to see it.",
  not_found: "This lead no longer exists.",
  forbidden: "Only agents can do that.",
  invalid: "Check what you entered.",
};

const nextStatuses: Record<LeadStatus, { to: string; label: string }[]> = {
  NEW: [
    { to: "CONTACTED", label: "Mark contacted" },
    { to: "QUALIFIED", label: "Mark qualified" },
    { to: "LOST", label: "Lost" },
  ],
  CONTACTED: [
    { to: "QUALIFIED", label: "Mark qualified" },
    { to: "LOST", label: "Lost" },
  ],
  QUALIFIED: [
    { to: "WON", label: "Won" },
    { to: "LOST", label: "Lost" },
  ],
  WON: [],
  LOST: [],
};

type Viewing = { id: string; status: ViewingStatus; requestedFor: string; confirmedFor: string | null };

export function LeadActions({
  leadId,
  status,
  unassigned,
  viewing,
}: {
  leadId: string;
  status: LeadStatus;
  unassigned: boolean;
  viewing: Viewing | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [otherTime, setOtherTime] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");

  function run(action: () => Promise<{ ok: true } | { ok: false; reason: string; message?: string }>, success: string, after?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast({ tone: "danger", title: result.message ?? messages[result.reason] ?? "Something went wrong." });
        return;
      }
      toast({ tone: "success", title: success });
      after?.();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {unassigned ? (
        <Button onClick={() => run(() => takeLeadAction({ leadId }), "It's yours now")} loading={pending}>
          Take this lead
        </Button>
      ) : null}

      {nextStatuses[status].length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-fg">Lead</h2>
          <div className="flex flex-wrap gap-2">
            {nextStatuses[status].map((move) => (
              <Button
                key={move.to}
                size="sm"
                intent={move.to === "LOST" ? "ghost" : "secondary"}
                disabled={pending}
                onClick={() => run(() => changeLeadStatusAction({ leadId, to: move.to }), "Lead updated")}
              >
                {move.label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {viewing ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-fg">Current viewing</h2>
          {viewing.status === "REQUESTED" ? (
            <>
              {otherTime ? (
                <div className="grid grid-cols-2 gap-2">
                  <Field id="confirm-date" label="Date">
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  </Field>
                  <Field id="confirm-time" label="Time (Sylhet)">
                    <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                  </Field>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={pending || (otherTime && (!date || !time))}
                  onClick={() =>
                    run(
                      () => changeViewingAction(otherTime ? { action: "confirm", viewingId: viewing.id, date, time } : { action: "confirm", viewingId: viewing.id }),
                      "Viewing confirmed",
                      () => setOtherTime(false),
                    )
                  }
                >
                  {otherTime ? "Confirm this time" : "Confirm requested time"}
                </Button>
                <Button size="sm" intent="ghost" onClick={() => setOtherTime((v) => !v)}>
                  {otherTime ? "Use requested time" : "Agree another time"}
                </Button>
              </div>
            </>
          ) : null}
          {viewing.status === "CONFIRMED" ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" intent="secondary" disabled={pending} onClick={() => run(() => changeViewingAction({ action: "complete", viewingId: viewing.id }), "Marked completed")}>
                Completed
              </Button>
              <Button size="sm" intent="secondary" disabled={pending} onClick={() => run(() => changeViewingAction({ action: "no_show", viewingId: viewing.id }), "Marked no show")}>
                No show
              </Button>
            </div>
          ) : null}
          {viewing.status === "REQUESTED" || viewing.status === "CONFIRMED" ? (
            <div className="flex items-end gap-2">
              <Field id="cancel-reason" label="Cancel with a reason" className="flex-1">
                <Input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
              </Field>
              <Button
                size="md"
                intent="ghost"
                disabled={pending}
                onClick={() => run(() => changeViewingAction({ action: "cancel", viewingId: viewing.id, reason }), "Viewing cancelled", () => setReason(""))}
              >
                Cancel
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addLeadNoteAction({ leadId, body: note }), "Note added", () => setNote(""));
        }}
      >
        <Field id="lead-note" label="Add a note" hint="Agency records are kept. Don't paste the buyer's personal details here.">
          <Textarea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Button type="submit" size="sm" intent="secondary" disabled={!note.trim() || pending} className="self-end">
          Add note
        </Button>
      </form>
    </div>
  );
}
