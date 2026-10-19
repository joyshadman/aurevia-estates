"use server";

import { requireAgentAction } from "@/lib/server/auth";
import { restoreFactSheet, saveFactSheet } from "@/lib/server/fact-sheet";

// Fact sheet actions (spec 0006, AC-14). Agents only; a save from a version
// that is no longer live is refused with `stale`.

export async function saveFactSheetAction(input: { body: string; previousId: string | null }) {
  const agent = await requireAgentAction();
  if ("ok" in agent) return agent;
  return saveFactSheet(input, agent);
}

export async function restoreFactSheetAction(input: { versionId: string; previousId: string | null }) {
  const agent = await requireAgentAction();
  if ("ok" in agent) return agent;
  return restoreFactSheet(input, agent);
}
