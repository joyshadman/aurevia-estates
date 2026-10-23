import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth/safe-next";
import { publicEnv } from "@/lib/env";

// Paths that need a session (spec 0008, *Routes and pages*). With no Better Auth
// session cookie at all, the visitor goes to sign in first. A convenience, not
// the security check: it never reads the database, and every page and action
// still calls `lib/server/auth.ts`. It refreshes nothing.
const signedInOnly = /^\/(account|dashboard|assistant)(\/|$)/;

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (signedInOnly.test(pathname) && !getSessionCookie(request)) {
    const signIn = new URL("/sign-in", publicEnv().NEXT_PUBLIC_SITE_URL);
    const next = safeNext(`${pathname}${search}`);
    if (next) signIn.searchParams.set("next", next);
    return NextResponse.redirect(signIn);
  }
  return NextResponse.next();
}

export const config = {
  // Skip static assets, image optimization, Better Auth's own routes, and files with an extension.
  matcher: ["/((?!_next/static|_next/image|api/auth/|favicon.ico|.*\\.[^/]+$).*)"],
};
