"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAgentAction } from "@/lib/server/auth";
import { NotFoundError } from "@/lib/server/errors";
import {
  addLeadNote as addLeadNoteService,
  assignLead as assignLeadService,
  cancelViewingAsAgent as cancelViewingService,
  changeViewingTimeAsAgent as changeViewingTimeService,
  closeViewing as closeViewingService,
  confirmViewing as confirmViewingService,
  loadTranscript as loadTranscriptService,
  moveLead as moveLeadService,
  type InboxResult,
} from "@/lib/server/lead-inbox";

// Lead inbox actions (spec 0009, *Services and actions*). Each checks the agent
// first (AC-16) and returns its denial reason unchanged, validates with Zod,
// and leaves the work to `lib/server/lead-inbox`.

const invalid = { ok: false as const, reason: "invalid" as const };

const version = z.iso.datetime({ offset: true }).transform((value) => new Date(value));
const at = z.object({ date: z.iso.date(), time: z.string().regex(/^([01]\d|2[0-3]):(00|15|30|45)$/) });
const reason = z.string().trim().min(1).max(200);
const leadStatus = z.enum(["NEW", "CONTACTED", "QUALIFIED", "WON", "LOST"]);

function refresh(result: InboxResult) {
  if (result.ok) {
    revalidatePath("/dashboard/leads");
    revalidatePath(`/dashboard/leads/${result.leadId}`);
  }
  return result;
}

const confirmInput = z.object({ viewingId: z.uuid(), version, at: at.optional() });

export async function confirmViewing(input: z.input<typeof confirmInput>) {
  const agent = await requireAgentAction();
  if (!agent.ok) return agent;
  const parsed = confirmInput.safeParse(input);
  if (!parsed.success) return invalid;
  return refresh(await confirmViewingService(agent.user, parsed.data));
}

const changeInput = z.object({ viewingId: z.uuid(), version, at });

export async function changeViewingTimeAsAgent(input: z.input<typeof changeInput>) {
  const agent = await requireAgentAction();
  if (!agent.ok) return agent;
  const parsed = changeInput.safeParse(input);
  if (!parsed.success) return invalid;
  return refresh(await changeViewingTimeService(agent.user, parsed.data));
}

const cancelInput = z.object({ viewingId: z.uuid(), version, reason });

export async function cancelViewingAsAgent(input: z.input<typeof cancelInput>) {
  const agent = await requireAgentAction();
  if (!agent.ok) return agent;
  const parsed = cancelInput.safeParse(input);
  if (!parsed.success) return invalid;
  return refresh(await cancelViewingService(agent.user, parsed.data));
}

const closeInput = z.object({ viewingId: z.uuid(), version, outcome: z.enum(["COMPLETED", "NO_SHOW"]) });

export async function closeViewing(input: z.input<typeof closeInput>) {
  const agent = await requireAgentAction();
  if (!agent.ok) return agent;
  const parsed = closeInput.safeParse(input);
  if (!parsed.success) return invalid;
  return refresh(await closeViewingService(agent.user, parsed.data));
}

// AC-11: Lost needs its reason.
const moveInput = z
  .object({ leadId: z.uuid(), from: leadStatus, to: leadStatus, reason: reason.optional() })
  .refine((value) => value.to !== "LOST" || value.reason !== undefined);

export async function moveLead(input: z.input<typeof moveInput>) {
  const agent = await requireAgentAction();
  if (!agent.ok) return agent;
  const parsed = moveInput.safeParse(input);
  if (!parsed.success) return invalid;
  return refresh(await moveLeadService(agent.user, parsed.data));
}

const noteInput = z.object({ leadId: z.uuid(), body: z.string().trim().min(1).max(2000) });

export async function addLeadNote(input: z.input<typeof noteInput>) {
  const agent = await requireAgentAction();
  if (!agent.ok) return agent;
  const parsed = noteInput.safeParse(input);
  if (!parsed.success) return invalid;
  return refresh(await addLeadNoteService(agent.user, parsed.data));
}

const assignInput = z.object({ leadId: z.uuid(), from: z.uuid().nullable(), agentId: z.uuid() });

export async function assignLead(input: z.input<typeof assignInput>) {
  const agent = await requireAgentAction();
  if (!agent.ok) return agent;
  const parsed = assignInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "not_an_agent" as const };
  return refresh(await assignLeadService(agent.user, parsed.data));
}

// AC-14: "Show earlier". A read, so it changes no cache.
const transcriptInput = z.object({ leadId: z.uuid(), beforeSeq: z.number().int().positive() });

export async function loadTranscript(input: z.input<typeof transcriptInput>) {
  const agent = await requireAgentAction();
  if (!agent.ok) return agent;
  const parsed = transcriptInput.safeParse(input);
  if (!parsed.success) return invalid;
  try {
    const transcript = await loadTranscriptService(parsed.data.leadId, parsed.data.beforeSeq);
    return { ok: true as const, transcript };
  } catch (error) {
    if (error instanceof NotFoundError) return { ok: false as const, reason: "not_found" as const };
    throw error;
  }
}
