"use server";

import { requireAgentAction } from "@/lib/server/auth";
import * as inbox from "@/lib/server/lead-inbox";

// Lead inbox actions (spec 0008, assumed). Agents only; every move goes through
// the status writers of spec 0002.

async function agent() {
  const result = await requireAgentAction();
  return "ok" in result ? { denied: { ok: false as const, reason: "forbidden" as const } } : { user: result };
}

export async function changeLeadStatusAction(input: { leadId: string; to: string; note?: string }) {
  const { user, denied } = await agent();
  return denied ?? inbox.changeLeadStatus(input, user);
}

export async function changeViewingAction(input: Parameters<typeof inbox.changeViewing>[0]) {
  const { user, denied } = await agent();
  return denied ?? inbox.changeViewing(input, user);
}

export async function addLeadNoteAction(input: { leadId: string; body: string }) {
  const { user, denied } = await agent();
  return denied ?? inbox.addLeadNote(input, user);
}

export async function takeLeadAction(input: { leadId: string }) {
  const { user, denied } = await agent();
  return denied ?? inbox.takeLead(input, user);
}
