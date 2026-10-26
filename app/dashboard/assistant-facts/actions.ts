"use server";

import { z } from "zod";
import {
  factSheetBody,
  restoreFactSheet as restoreFactSheetService,
  saveFactSheet as saveFactSheetService,
  type FactSheetResult,
} from "@/lib/server/assistant/fact-sheet";
import { requireAgentAction, type AgentDenial } from "@/lib/server/auth";

// Fact sheet actions (spec 0006, *Conversations and fact sheet actions*, AC-14).
// The chat reads the live version on every turn, so nothing is cached to refresh.

type ActionResult = FactSheetResult | { ok: false; reason: AgentDenial | "invalid" };

const saveInput = z.object({ body: factSheetBody, previousId: z.uuid() });

export async function saveFactSheet(input: z.input<typeof saveInput>): Promise<ActionResult> {
  const agent = await requireAgentAction();
  if (!agent.ok) return agent;
  const parsed = saveInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  return saveFactSheetService(agent.user, parsed.data.body, parsed.data.previousId);
}

const restoreInput = z.object({ versionId: z.uuid(), previousId: z.uuid() });

export async function restoreFactSheet(input: z.input<typeof restoreInput>): Promise<ActionResult> {
  const agent = await requireAgentAction();
  if (!agent.ok) return agent;
  const parsed = restoreInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  return restoreFactSheetService(agent.user, parsed.data.versionId, parsed.data.previousId);
}
