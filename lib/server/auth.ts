import "server-only";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { safeNext } from "@/lib/auth/safe-next";
import type { UserRole } from "@/lib/generated/prisma/client";
import { routes } from "@/lib/nav";
import { getAuth } from "@/lib/server/auth-config";
import { db } from "@/lib/server/db";
import { ForbiddenError } from "@/lib/server/errors";
import { reportError, reportEvent } from "@/lib/server/report";

export type CurrentUser = {
  id: string;
  email: string;
  role: UserRole;
};

// Who is acting, for permission checks in server modules (spec 0002).
export type Actor = Pick<CurrentUser, "id" | "role">;

export { ForbiddenError };

export type SessionUser = CurrentUser & {
  // '' when not set; show it through `displayName()`.
  fullName: string;
  avatarUrl: string | null;
};

type SessionRead = {
  user: SessionUser & { twoFactorEnabled: boolean };
  session: { token: string; createdAt: Date; twoFactorVerifiedAt: Date | null };
};

const roles: readonly UserRole[] = ["VISITOR", "AGENT", "SELLER"];
const asRole = (value: unknown): UserRole => (roles.includes(value as UserRole) ? (value as UserRole) : "VISITOR");
const asDate = (value: unknown) => (value instanceof Date ? value : typeof value === "string" ? new Date(value) : null);

// The one place server code learns who is signed in (spec 0008, *Auth
// helpers*). Better Auth reads the session row from Neon on every call (no
// cookie cache), so a revoked session is gone at once; the role and the
// deleted state come back on the session's user, from `profiles`. A missing or
// deleted profile counts as signed out (spec 0002 tombstone rule).
//
// `refresh: false` (every page render) never writes: no session extension and
// no cookies (AC-15: a page view alone doesn't extend a session). Actions pass
// `refresh: true`, so taking an action extends a visitor's session at most
// once a day.
async function readSession({ refresh }: { refresh: boolean }): Promise<SessionRead | null> {
  // Headers first: they make the render dynamic before the auth instance (and
  // its secrets) is ever built, so prerendering never needs them.
  const requestHeaders = await headers();
  const result = await getAuth().api.getSession({ headers: requestHeaders, query: { disableRefresh: !refresh } });
  if (!result) return null;
  const user = result.user as typeof result.user & Record<string, unknown>;
  const session = result.session as typeof result.session & Record<string, unknown>;
  if (user.deletedAt) return null;
  return {
    user: {
      id: user.id,
      email: user.email,
      role: asRole(user.role),
      fullName: user.name ?? "",
      avatarUrl: user.image ?? null,
      twoFactorEnabled: user.twoFactorEnabled === true,
    },
    session: {
      token: session.token,
      createdAt: asDate(session.createdAt) ?? new Date(0),
      twoFactorVerifiedAt: asDate(session.twoFactorVerifiedAt),
    },
  };
}

export async function getCurrentUser({ refresh = false }: { refresh?: boolean } = {}): Promise<CurrentUser | null> {
  const read = await readSession({ refresh });
  return read && { id: read.user.id, email: read.user.email, role: read.user.role };
}

// For the header's account slot (spec 0003). Read only.
export async function getSessionUser(): Promise<SessionUser | null> {
  const read = await readSession({ refresh: false });
  if (!read) return null;
  const { id, email, role, fullName, avatarUrl } = read.user;
  return { id, email, role, fullName, avatarUrl };
}

// Throws unless the current user holds one of the roles. An agent passes only
// through the full agent check, so this is never a path around 2FA (AC-8).
export async function requireRole(...allowed: UserRole[]): Promise<CurrentUser> {
  const user = await getCurrentUser({ refresh: true });
  if (!user || !allowed.includes(user.role)) throw new ForbiddenError();
  if (user.role === "AGENT") {
    const agent = await requireAgentAction();
    if (!agent.ok) throw new ForbiddenError();
  }
  return user;
}

// ---------------------------------------------------------------------------
// Sign in (spec 0008, AC-1, AC-11, AC-12).

export { safeNext };

// AC-12: agents start in the lead inbox (through the agent check), everyone else in the chat.
export function defaultLanding(role: UserRole): string {
  return role === "AGENT" ? "/dashboard/leads" : routes.assistant;
}

export function signInPath(next?: string | null, error?: string): string {
  const params = new URLSearchParams();
  const safe = safeNext(next);
  if (safe) params.set("next", safe);
  if (error) params.set("error", error);
  const query = params.toString();
  return query ? `${routes.signIn}?${query}` : routes.signIn;
}

// Pages for signed in users only. `next` is where to come back after signing in.
export async function requireUser({ next }: { next: string }): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(signInPath(next));
  return user;
}

// Every path that creates a session ends here, and so does `/auth/continue`
// after Google. The deleted check already ran when the session was created
// (`session.create.before`). An action passes the user its `auth.api.*` call
// returned: the cookie it just set is not in this request's headers, so reading
// the session again would miss it. `/auth/continue` is a new request and reads it.
export async function completeSignIn(
  next: string | null | undefined,
  signedIn?: { user: object } | null,
): Promise<never> {
  // `role` is a returned additional field on Better Auth's user.
  const role = signedIn ? asRole((signedIn.user as { role?: unknown }).role) : (await getCurrentUser())?.role;
  if (!role) redirect(`${routes.signIn}?error=link_invalid`);
  redirect(safeNext(next) ?? defaultLanding(role));
}

// ---------------------------------------------------------------------------
// Agents and 2FA (spec 0008, AC-8, AC-9).

export type AgentUser = CurrentUser & { role: "AGENT" };

export type AgentDenial = "signed_out" | "not_found" | "mfa_required";

// An authenticator code counts for 12 hours.
const twoFactorFreshMs = 12 * 60 * 60 * 1000;

const passedTwoFactorRecently = (session: SessionRead["session"]) =>
  session.twoFactorVerifiedAt !== null && Date.now() - session.twoFactorVerifiedAt.getTime() < twoFactorFreshMs;

// The shared predicate behind `requireAgent`, `requireAgentAction`, and the
// "already signed in" redirect on `/sign-in`, so the two pages never bounce a
// user between each other.
export function isAgentSessionFresh(read: Pick<SessionRead, "session">): boolean {
  return passedTwoFactorRecently(read.session);
}

type AgentCheck =
  | { ok: true; user: AgentUser }
  | { ok: false; reason: AgentDenial | "setup_required"; read: SessionRead | null };

// The AC-8 order: a live session, then the role from the database, then 2FA
// on, then an authenticator code within 12 hours.
async function checkAgent({ refresh }: { refresh: boolean }): Promise<AgentCheck> {
  const read = await readSession({ refresh });
  if (!read) return { ok: false, reason: "signed_out", read };
  if (read.user.role !== "AGENT") return { ok: false, reason: "not_found", read };
  if (!read.user.twoFactorEnabled) return { ok: false, reason: "setup_required", read };
  if (!isAgentSessionFresh(read)) return { ok: false, reason: "mfa_required", read };
  return { ok: true, user: { id: read.user.id, email: read.user.email, role: "AGENT" } };
}

export function securitySetupPath(next: string) {
  return `/account/security?${new URLSearchParams({ setup: "required", next })}`;
}

// Every page under `/dashboard` calls this itself (layouts do not rerun on
// client navigation). A visitor sees a plain 404. It never ends a session: a
// prefetch or a double render must not sign anyone out.
export async function requireAgent({ next }: { next: string }): Promise<AgentUser> {
  const check = await checkAgent({ refresh: false });
  if (check.ok) return check.user;
  if (check.reason !== "not_found") reportEvent("auth.agent_denied", { reason: check.reason, next });
  switch (check.reason) {
    case "signed_out":
      redirect(signInPath(next));
    case "not_found":
      notFound();
    case "setup_required":
      redirect(securitySetupPath(next));
    case "mfa_required":
      redirect(signInPath(next, "agent_reauth"));
  }
}

// The same check for agent server actions: they return the reason instead of
// acting. An action may write cookies, so a stale agent session ends here.
export async function requireAgentAction(): Promise<{ ok: true; user: AgentUser } | { ok: false; reason: AgentDenial }> {
  const check = await checkAgent({ refresh: true });
  if (check.ok) return check;
  reportEvent("auth.agent_action_denied", { reason: check.reason });
  if (check.reason === "mfa_required" && check.read) {
    const requestHeaders = await headers();
    await getAuth().api.revokeSession({ headers: requestHeaders, body: { token: check.read.session.token } });
  }
  return { ok: false, reason: check.reason === "setup_required" ? "mfa_required" : check.reason };
}

// For 2FA and sign in method changes: an authenticator code within 12 hours.
export async function requireFreshTwoFactor(): Promise<
  { ok: true; user: CurrentUser } | { ok: false; reason: "signed_out" | "mfa_required" }
> {
  const read = await readSession({ refresh: true });
  if (!read) return { ok: false, reason: "signed_out" };
  if (!passedTwoFactorRecently(read.session)) return { ok: false, reason: "mfa_required" };
  return { ok: true, user: { id: read.user.id, email: read.user.email, role: read.user.role } };
}

// For `/sign-in`: whether a signed in user should be sent on at once (AC-1),
// or shown the password step because they are an agent whose session has not
// passed the authenticator step lately (AC-8).
export async function signInRedirectTarget(next: string | null): Promise<string | null> {
  const read = await readSession({ refresh: false });
  if (!read) return null;
  if (read.user.role === "AGENT" && !isAgentSessionFresh(read)) return null;
  return next ?? defaultLanding(read.user.role);
}

// ---------------------------------------------------------------------------
// The authenticator step of a password sign in (spec 0008, *State
// transitions*): Better Auth's temporary 2FA cookie, set between a correct
// password and the code. No session exists yet.

async function twoFactorCookieName() {
  // The name carries Better Auth's prefix (and `__Secure-` on https).
  return (await getAuth().$context).createAuthCookie("two_factor").name;
}

export async function pendingTwoFactor(): Promise<{ name: string; value: string } | null> {
  const [name, jar] = await Promise.all([twoFactorCookieName(), cookies()]);
  const value = jar.get(name)?.value;
  return value ? { name, value } : null;
}

// Ends the step, so the next try needs the password again. Actions only.
export async function clearPendingTwoFactor() {
  const [name, jar] = await Promise.all([twoFactorCookieName(), cookies()]);
  jar.set(name, "", { maxAge: 0, path: "/", httpOnly: true, sameSite: "lax", secure: name.startsWith("__Secure-") });
}

// ---------------------------------------------------------------------------
// `/account/security` and its actions (AC-9).

// An agent turns on 2FA only this soon after signing in (Better Auth's `freshAge`).
export const twoFactorEnrollWindowMs = 15 * 60 * 1000;

export type SecurityState = {
  user: CurrentUser & { twoFactorEnabled: boolean };
  hasPassword: boolean;
  // The session's start, for the agent enrollment window.
  signedInAt: Date;
  // An authenticator code within 12 hours.
  twoFactorFresh: boolean;
};

export async function getSecurityState({ refresh = false }: { refresh?: boolean } = {}): Promise<SecurityState | null> {
  const read = await readSession({ refresh });
  if (!read) return null;
  const credentials = await db.account.count({ where: { userId: read.user.id, providerId: "credential" } });
  const { id, email, role, twoFactorEnabled } = read.user;
  return {
    user: { id, email, role, twoFactorEnabled },
    hasPassword: credentials > 0,
    signedInAt: read.session.createdAt,
    twoFactorFresh: passedTwoFactorRecently(read.session),
  };
}

// AC-9: an agent turns on 2FA only within 15 minutes of signing in.
export function canEnrollTwoFactor(state: SecurityState): boolean {
  return state.user.role !== "AGENT" || Date.now() - state.signedInAt.getTime() < twoFactorEnrollWindowMs;
}

// Unused backup codes left (spec 0008, *Value sourcing*): Better Auth decrypts
// them; a used code is removed from the list.
export async function backupCodesLeft(userId: string): Promise<number> {
  try {
    const result = await getAuth().api.viewBackupCodes({ body: { userId } });
    return result.backupCodes.length;
  } catch (error) {
    reportError("auth.backup_codes_read_failed", error);
    return 0;
  }
}
