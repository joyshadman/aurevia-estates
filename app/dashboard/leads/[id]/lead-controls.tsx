"use client";

import { CalendarCheck, CalendarClock, CalendarX, UserCheck, UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ViewingStateBadge } from "@/app/assistant/viewing-parts";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import {
  AGENT_TIME_STEPS,
  dhakaDateTime,
  formatSlotDay,
  formatTimeStep,
  formatViewingTime,
} from "@/lib/domain/viewing-slots";
import type { LeadStatus } from "@/lib/generated/prisma/enums";
import type { LeadDetail } from "@/lib/server/lead-inbox";
import {
  addLeadNote,
  assignLead,
  cancelViewingAsAgent,
  changeViewingTimeAsAgent,
  closeViewing,
  confirmViewing,
  moveLead,
} from "../actions";
import { fieldMessages, leadMessages, type LeadMessageReason } from "../messages";
import { moveLabels } from "../status";

type Outcome = { ok: true } | { ok: false; reason: LeadMessageReason };

// Runs one lead action. Success toasts and refreshes the page from the server
// (spec 0009, *Services and actions*); a failure goes to `onError`, else a toast.
function useLeadAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (
    call: () => Promise<Outcome>,
    options: { success: string; onSuccess?: () => void; onError?: (reason: LeadMessageReason) => void },
  ) =>
    startTransition(async () => {
      const result = await call();
      if (result.ok) {
        options.onSuccess?.();
        toast({ tone: "success", title: options.success });
        router.refresh();
      } else if (options.onError) {
        options.onError(result.reason);
      } else {
        toast({ tone: "danger", title: leadMessages[result.reason] });
      }
    });
  return { pending, run };
}

function DialogError({ reason, field }: { reason: LeadMessageReason | null; field?: keyof typeof fieldMessages }) {
  if (!reason) return null;
  return (
    <p role="alert" className="mt-4 rounded-xl bg-danger-subtle px-4 py-3 text-sm text-danger-subtle-fg">
      {reason === "invalid" && field ? fieldMessages[field] : leadMessages[reason]}
    </p>
  );
}

// ---------------------------------------------------------------------------
// The current viewing (AC-6 to AC-10).

type Current = NonNullable<LeadDetail["current"]>;

// A Dhaka date from today to 30 days ahead and a time in 15 minute steps (AC-6).
function TimePicker({
  idPrefix,
  dates,
  value,
  onChange,
  disabled,
}: {
  idPrefix: string;
  dates: string[];
  value: { date: string; time: string };
  onChange: (value: { date: string; time: string }) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id={`${idPrefix}-date`} label="Date">
        <Select value={value.date} onChange={(event) => onChange({ ...value, date: event.target.value })} disabled={disabled}>
          {dates.map((date, index) => (
            <option key={date} value={date}>
              {index === 0 ? `Today, ${formatSlotDay(date)}` : formatSlotDay(date)}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={`${idPrefix}-time`} label="Time (Sylhet)">
        <Select value={value.time} onChange={(event) => onChange({ ...value, time: event.target.value })} disabled={disabled}>
          {AGENT_TIME_STEPS.map((time) => (
            <option key={time} value={time}>
              {formatTimeStep(time)}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

// Prefills the picker at a viewing's time, snapped to the 15 minute grid and
// inside the offered dates.
function initialTime(at: string, dates: string[]) {
  const { date, time } = dhakaDateTime(at);
  const [hours, minutes] = time.split(":").map(Number);
  const snapped = `${String(hours).padStart(2, "0")}:${String(Math.floor(minutes / 15) * 15).padStart(2, "0")}`;
  return { date: dates.includes(date) ? date : dates[0], time: snapped };
}

type ViewingDialog = null | "confirm" | "change" | "cancel";

export function ViewingControls({ viewing, dates }: { viewing: Current; dates: string[] }) {
  const { pending, run } = useLeadAction();
  const [dialog, setDialog] = useState<ViewingDialog>(null);
  const [error, setError] = useState<LeadMessageReason | null>(null);
  const [time, setTime] = useState(() => initialTime(viewing.confirmedFor ?? viewing.requestedFor, dates));
  const [reason, setReason] = useState("");
  const { actions } = viewing;
  const target = { viewingId: viewing.id, version: viewing.version };

  const open = (next: Exclude<ViewingDialog, null>) => {
    setError(null);
    setReason("");
    setTime(initialTime(viewing.confirmedFor ?? viewing.requestedFor, dates));
    setDialog(next);
  };
  const close = () => setDialog(null);

  const confirmRequested = () =>
    run(() => confirmViewing(target), { success: `Confirmed for ${formatViewingTime(viewing.requestedFor)}` });

  const submitDialog = () => {
    setError(null);
    if (dialog === "confirm") {
      run(() => confirmViewing({ ...target, at: time }), { success: "Viewing confirmed", onSuccess: close, onError: setError });
    } else if (dialog === "change") {
      run(() => changeViewingTimeAsAgent({ ...target, at: time }), { success: "Viewing time changed", onSuccess: close, onError: setError });
    } else if (dialog === "cancel") {
      if (!reason.trim()) {
        setError("invalid");
        return;
      }
      run(() => cancelViewingAsAgent({ ...target, reason }), { success: "Viewing cancelled", onSuccess: close, onError: setError });
    }
  };

  const markClosed = (outcome: "COMPLETED" | "NO_SHOW") =>
    run(() => closeViewing({ ...target, outcome }), { success: outcome === "COMPLETED" ? "Marked completed" : "Marked as no show" });

  const anyAction = actions.confirmRequested || actions.confirmOther || actions.changeTime || actions.cancel || actions.close;

  return (
    <>
      {anyAction ? (
        <div className="flex flex-wrap gap-3">
          {actions.confirmRequested ? (
            <Button type="button" onClick={confirmRequested} loading={pending} disabled={pending}>
              <CalendarCheck aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
              Confirm requested time
            </Button>
          ) : null}
          {actions.confirmOther ? (
            <Button
              type="button"
              intent={actions.confirmRequested ? "secondary" : "primary"}
              onClick={() => open("confirm")}
              disabled={pending}
            >
              <CalendarClock aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
              Confirm another time
            </Button>
          ) : null}
          {actions.close ? (
            <>
              <Button type="button" onClick={() => markClosed("COMPLETED")} disabled={pending}>
                <UserCheck aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
                Completed
              </Button>
              <Button type="button" intent="secondary" onClick={() => markClosed("NO_SHOW")} disabled={pending}>
                <UserX aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
                No show
              </Button>
            </>
          ) : null}
          {actions.changeTime ? (
            <Button type="button" intent="secondary" onClick={() => open("change")} disabled={pending}>
              <CalendarClock aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
              Change time
            </Button>
          ) : null}
          {actions.cancel ? (
            <Button type="button" intent="ghost" onClick={() => open("cancel")} disabled={pending} className="text-danger">
              <CalendarX aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
              Cancel viewing
            </Button>
          ) : null}
        </div>
      ) : null}
      {viewing.status === "CONFIRMED" && !actions.close ? (
        <p className="text-xs text-fg-subtle">Completed and No show appear once the viewing time has passed.</p>
      ) : null}

      <Dialog
        open={dialog !== null}
        onClose={close}
        title={dialog === "cancel" ? "Cancel this viewing?" : dialog === "change" ? "Change the viewing time" : "Confirm another time"}
        description={
          dialog === "cancel"
            ? "The buyer sees it as cancelled in their chat and on their account."
            : "Set the time you agreed with the buyer by phone. They see it in their chat."
        }
        footer={
          <>
            <Button type="button" intent="ghost" onClick={close} disabled={pending}>
              Back
            </Button>
            <Button type="button" intent={dialog === "cancel" ? "danger" : "primary"} onClick={submitDialog} loading={pending} disabled={pending}>
              {dialog === "cancel" ? "Cancel viewing" : dialog === "change" ? "Save new time" : "Confirm viewing"}
            </Button>
          </>
        }
      >
        {dialog === "cancel" ? (
          <Field id="cancel-reason" label="Reason" hint={`${reason.trim().length} of 200 characters. Kept in the lead's history.`}>
            <Textarea value={reason} maxLength={200} rows={3} onChange={(event) => setReason(event.target.value)} disabled={pending} />
          </Field>
        ) : dialog !== null ? (
          <TimePicker idPrefix="viewing" dates={dates} value={time} onChange={setTime} disabled={pending} />
        ) : null}
        <DialogError reason={error} field={dialog === "cancel" ? "reason" : "time"} />
      </Dialog>
    </>
  );
}

export function CurrentViewingSummary({ viewing }: { viewing: Current }) {
  const changed = viewing.confirmedFor !== null && viewing.confirmedFor !== viewing.requestedFor;
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl bg-surface-sunken p-5">
      <div>
        <p className="text-xs tracking-wide text-fg-subtle uppercase">{viewing.status === "CONFIRMED" ? "Confirmed for" : "Requested for"}</p>
        <p className="mt-1 font-display text-2xl text-fg">
          <time dateTime={viewing.start}>{formatViewingTime(viewing.start)}</time>
        </p>
        {changed ? (
          <p className="mt-1 text-sm text-fg-muted">
            The buyer asked for <time dateTime={viewing.requestedFor}>{formatViewingTime(viewing.requestedFor)}</time>
          </p>
        ) : null}
      </div>
      <ViewingStateBadge state={viewing.state} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lead moves (AC-11).

export function LeadStatusControls({ leadId, status, moves }: { leadId: string; status: LeadStatus; moves: LeadStatus[] }) {
  const { pending, run } = useLeadAction();
  const [dialog, setDialog] = useState<null | "WON" | "LOST">(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<LeadMessageReason | null>(null);

  const move = (to: LeadStatus, extra: { reason?: string; onSuccess?: () => void; onError?: (reason: LeadMessageReason) => void } = {}) =>
    run(() => moveLead({ leadId, from: status, to, reason: extra.reason }), {
      success: `Lead marked ${moveLabels[to] === "Mark contacted" ? "contacted" : moveLabels[to].toLowerCase()}`,
      onSuccess: extra.onSuccess,
      onError: extra.onError,
    });

  const openDialog = (to: "WON" | "LOST") => {
    setReason("");
    setError(null);
    setDialog(to);
  };

  const submit = () => {
    if (dialog === "LOST" && !reason.trim()) {
      setError("invalid");
      return;
    }
    if (dialog) move(dialog, { reason: dialog === "LOST" ? reason : undefined, onSuccess: () => setDialog(null), onError: setError });
  };

  if (moves.length === 0) {
    return <p className="text-sm text-fg-muted">This lead is closed. Its viewings can still be cancelled or closed.</p>;
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {moves.map((to) => (
          <Button
            key={to}
            type="button"
            size="sm"
            intent={to === "LOST" ? "ghost" : to === "WON" ? "primary" : "secondary"}
            className={to === "LOST" ? "text-danger" : undefined}
            disabled={pending}
            onClick={() => (to === "WON" || to === "LOST" ? openDialog(to) : move(to))}
          >
            {moveLabels[to]}
          </Button>
        ))}
      </div>
      <Dialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={dialog === "WON" ? "Mark this lead won?" : "Mark this lead lost?"}
        description={
          dialog === "WON"
            ? "Won closes the lead for good. Its viewings can still be closed or cancelled."
            : "Lost closes the lead for good. Say why, for the agency's records."
        }
        footer={
          <>
            <Button type="button" intent="ghost" onClick={() => setDialog(null)} disabled={pending}>
              Back
            </Button>
            <Button type="button" intent={dialog === "LOST" ? "danger" : "primary"} onClick={submit} loading={pending} disabled={pending}>
              {dialog === "WON" ? "Mark won" : "Mark lost"}
            </Button>
          </>
        }
      >
        {dialog === "LOST" ? (
          <Field id="lost-reason" label="Reason" hint={`${reason.trim().length} of 200 characters.`}>
            <Textarea value={reason} maxLength={200} rows={3} onChange={(event) => setReason(event.target.value)} disabled={pending} />
          </Field>
        ) : null}
        <DialogError reason={error} field="reason" />
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Assignment (AC-13).

export function AdvisorControls({
  leadId,
  advisor,
  agents,
  me,
}: {
  leadId: string;
  advisor: LeadDetail["advisor"];
  agents: LeadDetail["agents"];
  me: string;
}) {
  const { pending, run } = useLeadAction();
  const [pick, setPick] = useState(advisor?.id ?? "");
  const from = advisor?.id ?? null;

  const assign = (agentId: string) =>
    run(() => assignLead({ leadId, from, agentId }), {
      success: agentId === me ? "Assigned to you" : `Assigned to ${agents.find((agent) => agent.id === agentId)?.fullName ?? "the agent"}`,
    });

  return (
    <div className="flex flex-col gap-4">
      {advisor?.id !== me ? (
        <Button type="button" intent="secondary" size="sm" onClick={() => assign(me)} disabled={pending} className="self-start">
          Assign to me
        </Button>
      ) : null}
      <div className="flex items-end gap-2">
        <Field id="advisor-pick" label="Advisor" className="min-w-0 flex-1">
          <Select value={pick} onChange={(event) => setPick(event.target.value)} disabled={pending}>
            {advisor === null ? <option value="">Unassigned</option> : null}
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.fullName}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="button" size="sm" onClick={() => assign(pick)} disabled={pending || !pick || pick === advisor?.id} className="mb-1">
          Assign
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notes (AC-12).

export function NoteForm({ leadId }: { leadId: string }) {
  const { pending, run } = useLeadAction();
  const [body, setBody] = useState("");
  const [error, setError] = useState<LeadMessageReason | null>(null);
  const length = body.trim().length;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (length === 0 || length > 2000) {
      setError("invalid");
      return;
    }
    setError(null);
    run(() => addLeadNote({ leadId, body }), { success: "Note added", onSuccess: () => setBody(""), onError: setError });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <Field
        id="lead-note"
        label="Add a note"
        hint="Don't paste the buyer's personal data (ID numbers, bank details, addresses). Agents keep notes after an account is deleted."
        error={error ? (error === "invalid" ? fieldMessages.note : leadMessages[error]) : undefined}
        showError={error !== null}
      >
        <Textarea value={body} maxLength={2000} rows={3} onChange={(event) => setBody(event.target.value)} disabled={pending} />
      </Field>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-fg-subtle tabular-nums">{length} of 2,000</span>
        <Button type="submit" size="sm" loading={pending} disabled={pending}>
          Add note
        </Button>
      </div>
    </form>
  );
}
