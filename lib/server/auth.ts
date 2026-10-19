import "server-only";
import type { UserRole } from "@/lib/generated/prisma/client";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/server/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string | null;
  role: UserRole;
};

// Who is acting, for permission checks in server modules (spec 0002).
export type Actor = Pick<CurrentUser, "id" | "role">;

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export type SessionUser = CurrentUser & {
  fullName: string | null;
  avatarUrl: string | null;
};

const sessionProfile = {
  id: true,
  email: true,
  role: true,
  fullName: true,
  avatarUrl: true,
  deletedAt: true,
} as const;

// The one place server code learns who is signed in (spec 0001). The session is
// verified on the server with `getClaims()` (signature checked), never trusted
// from the cookie alone. The role always comes from the database, never the JWT.
// With `createMissing`, a first sign in creates the profile with
// `on conflict (id) do nothing`, so concurrent first requests are safe. An
// existing profile is never updated: a deleted one (`deleted_at` set) stays a
// tombstone and counts as signed out (spec 0002, AC-10).
async function readSession(createMissing: boolean): Promise<SessionUser | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const id = data.claims.sub;

  let profile = await db.profile.findUnique({ where: { id }, select: sessionProfile });
  if (!profile && createMissing) {
    const email = typeof data.claims.email === "string" && data.claims.email ? data.claims.email : null;
    await db.$executeRaw`
      INSERT INTO profiles (id, email, created_at, updated_at)
      VALUES (${id}::uuid, ${email}, now(), now())
      ON CONFLICT (id) DO NOTHING`;
    profile = await db.profile.findUnique({ where: { id }, select: sessionProfile });
  }
  if (!profile || profile.deletedAt) return null;

  return {
    id: profile.id,
    email: profile.email,
    role: profile.role,
    fullName: profile.fullName,
    avatarUrl: profile.avatarUrl,
  };
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const user = await readSession(true);
  return user && { id: user.id, email: user.email, role: user.role };
}

// For the header's account slot (spec 0003). Never creates or updates a profile.
export async function getSessionUser(): Promise<SessionUser | null> {
  return readSession(false);
}

// Throws unless the current user holds one of the roles. Agent pages and actions
// use the stricter MFA aware helpers added by the sign in feature (spec 0004).
export async function requireRole(...roles: UserRole[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || !roles.includes(user.role)) throw new ForbiddenError();
  return user;
}

// ---------------------------------------------------------------------------
// Agent gate (spec 0004, AC-8). Session first, confirmed with Supabase through
// `auth.getUser()` (fails once the session is revoked), then the role from the
// database. Anyone who is not an active AGENT gets a 404, so agent pages don't
// reveal that they exist.
// TODO(spec 0004, build plan 5): add the MFA steps (verified TOTP factor, then
// `aal2` with a TOTP `amr` entry under 12 hours old) before any real agent signs in.

export type AgentUser = SessionUser & { role: "AGENT" };
export type AgentActionDenied = { ok: false; reason: "signed_out" | "not_found" | "mfa_required" };

async function readAgent(): Promise<AgentUser | AgentActionDenied> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { ok: false, reason: "signed_out" };
  const profile = await db.profile.findUnique({ where: { id: data.user.id }, select: sessionProfile });
  if (!profile || profile.deletedAt || profile.role !== "AGENT") return { ok: false, reason: "not_found" };
  return {
    id: profile.id,
    email: profile.email,
    role: "AGENT",
    fullName: profile.fullName,
    avatarUrl: profile.avatarUrl,
  };
}

// For every page under `app/dashboard/**`. `next` is the path to return to after sign in.
export async function requireAgent({ next }: { next: string }): Promise<AgentUser> {
  const result = await readAgent();
  if ("ok" in result) {
    if (result.reason === "signed_out") redirect(`/sign-in?next=${encodeURIComponent(next)}`);
    notFound();
  }
  return result;
}

// For every agent server action: the same checks, returned instead of redirecting.
export async function requireAgentAction(): Promise<AgentUser | AgentActionDenied> {
  return readAgent();
}
