"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/server/auth";
import { saveHome as saveHomeService, savedSlugs, unsaveHome as unsaveHomeService } from "@/lib/server/saved-homes";

// Saved homes actions (spec 0014). Visitor style: read the user with a session
// refresh and return `signed_out` instead of redirecting (app/AGENTS.md).

const slugInput = z.object({ slug: z.string().min(1).max(200) });

export async function loadSavedSlugs(): Promise<{ ok: true; slugs: string[] } | { ok: false; reason: "signed_out" }> {
  const user = await getCurrentUser({ refresh: true });
  if (!user) return { ok: false, reason: "signed_out" };
  return { ok: true, slugs: await savedSlugs(user) };
}

export async function saveHome(input: z.input<typeof slugInput>): Promise<{ ok: true } | { ok: false; reason: "signed_out" | "unavailable" }> {
  const user = await getCurrentUser({ refresh: true });
  if (!user) return { ok: false, reason: "signed_out" };
  const parsed = slugInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "unavailable" };
  return saveHomeService(user, parsed.data.slug);
}

export async function unsaveHome(input: z.input<typeof slugInput>): Promise<{ ok: true } | { ok: false; reason: "signed_out" | "unavailable" }> {
  const user = await getCurrentUser({ refresh: true });
  if (!user) return { ok: false, reason: "signed_out" };
  const parsed = slugInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "unavailable" };
  await unsaveHomeService(user, parsed.data.slug);
  return { ok: true };
}
