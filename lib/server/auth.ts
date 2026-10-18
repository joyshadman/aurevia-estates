import "server-only";
import type { UserRole } from "@/lib/generated/prisma/client";
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

// The one place server code learns who is signed in (spec 0001). The session is
// verified on the server with `getClaims()` (signature checked), never trusted
// from the cookie alone. The role always comes from the database, never the JWT.
// Read only: it never writes, so it is safe inside rendering. A missing or
// deleted profile counts as signed out (spec 0002 tombstone rule).
async function readSession(): Promise<SessionUser | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;

  const profile = await db.profile.findUnique({
    where: { id: data.claims.sub },
    select: { id: true, email: true, role: true, fullName: true, avatarUrl: true, deletedAt: true },
  });
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
  const user = await readSession();
  return user && { id: user.id, email: user.email, role: user.role };
}

// For the header's account slot (spec 0003). Never creates or updates a profile.
export async function getSessionUser(): Promise<SessionUser | null> {
  return readSession();
}

// Throws unless the current user holds one of the roles. Agent pages and actions
// use the stricter MFA aware helpers added by the sign in feature (spec 0004).
export async function requireRole(...roles: UserRole[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || !roles.includes(user.role)) throw new ForbiddenError();
  return user;
}
