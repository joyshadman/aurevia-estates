import "server-only";
import type { UserRole } from "@/lib/generated/prisma/client";
import { notFound, redirect } from "next/navigation";
import { agentGate, amrEntries, hasFreshMfa, type AmrEntry } from "@/lib/domain/auth-rules";
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

type ProfileRow = { id: string; email: string | null; role: UserRole; fullName: string | null; avatarUrl: string | null };
const toSessionUser = (p: ProfileRow): SessionUser => ({
  id: p.id,
  email: p.email,
  role: p.role,
  fullName: p.fullName,
  avatarUrl: p.avatarUrl,
});

// The one place server code learns who is signed in (spec 0001, spec 0004).
// The session is verified with `getClaims()` (signature checked), never trusted
// from the cookie alone; the role always comes from the database. Read only:
// profiles are created by `ensureProfile` when a sign in completes, and a
// profile with `deleted_at` set counts as signed out (spec 0002, AC-10).
async function readSession(): Promise<SessionUser | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const profile = await db.profile.findUnique({ where: { id: data.claims.sub }, select: sessionProfile });
  if (!profile || profile.deletedAt) return null;
  return toSessionUser(profile);
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const user = await readSession();
  return user && { id: user.id, email: user.email, role: user.role };
}

// For the header's account slot (spec 0003).
export async function getSessionUser(): Promise<SessionUser | null> {
  return readSession();
}

// For signed in pages: signed out → sign in, then back to `next`.
export async function requireUser({ next }: { next: string }): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return user;
}

// ---------------------------------------------------------------------------
// Agent gate (spec 0004, AC-8), in this order: a session Supabase confirms now
// (`getUser()` fails once the session is revoked), the role from the database
// (anyone else gets a 404, so agent pages don't reveal they exist), a verified
// authenticator (else setup), then an aal2 session with a TOTP code from the last
// 12 hours (else `/mfa`).

export type AgentUser = SessionUser & { role: "AGENT" };
export type AgentActionDenied = { ok: false; reason: "signed_out" | "not_found" | "mfa_required" };
type AgentDenied = { ok: false; reason: "signed_out" | "not_found" | "setup" | "mfa" };

// What the MFA checks need from the session.
export async function mfaState() {
  const supabase = await createSupabaseServerClient();
  const [{ data: factors }, { data: level }] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  const verified = (factors?.totp ?? []).filter((f) => f.status === "verified");
  const amr: AmrEntry[] = amrEntries(level?.currentAuthenticationMethods);
  return { verified, all: factors?.all ?? [], level: level?.currentLevel ?? null, amr };
}

async function readAgent(): Promise<AgentUser | AgentDenied> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { ok: false, reason: "signed_out" };
  const profile = await db.profile.findUnique({ where: { id: data.user.id }, select: sessionProfile });
  if (!profile || profile.deletedAt || profile.role !== "AGENT") return { ok: false, reason: "not_found" };

  const mfa = await mfaState();
  const gate = agentGate({ hasVerifiedTotp: mfa.verified.length > 0, level: mfa.level, amr: mfa.amr, now: Date.now() });
  if (gate !== "ok") return { ok: false, reason: gate };
  return { ...toSessionUser(profile), role: "AGENT" };
}

// For every page under `app/dashboard/**`. `next` is the path to return to.
export async function requireAgent({ next }: { next: string }): Promise<AgentUser> {
  const result = await readAgent();
  if ("ok" in result) {
    const back = encodeURIComponent(next);
    if (result.reason === "signed_out") redirect(`/sign-in?next=${back}`);
    if (result.reason === "setup") redirect(`/account/security?setup=required&next=${back}`);
    if (result.reason === "mfa") redirect(`/mfa?next=${back}`);
    notFound();
  }
  return result;
}

// For every agent server action: the same checks, returned instead of redirecting.
export async function requireAgentAction(): Promise<AgentUser | AgentActionDenied> {
  const result = await readAgent();
  if ("ok" in result && (result.reason === "setup" || result.reason === "mfa")) return { ok: false, reason: "mfa_required" };
  return result as AgentUser | AgentActionDenied;
}

// Factor and identity changes need a TOTP code from the last 12 hours (AC-9).
export async function requireFreshMfa(): Promise<CurrentUser | { ok: false; reason: "signed_out" | "mfa_required" }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "signed_out" };
  const mfa = await mfaState();
  return hasFreshMfa(mfa.level, mfa.amr, Date.now()) ? user : { ok: false, reason: "mfa_required" };
}

// Throws unless the current user holds one of the roles. For AGENT it goes
// through the full agent gate, never around MFA (spec 0004).
export async function requireRole(...roles: UserRole[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || !roles.includes(user.role)) throw new ForbiddenError();
  if (user.role === "AGENT") {
    const agent = await requireAgentAction();
    if ("ok" in agent) throw new ForbiddenError();
  }
  return user;
}
