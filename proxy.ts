import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import { updateSession } from "@/lib/supabase/proxy";

// Signed in areas. With no session cookie at all, send the visitor to sign in
// before rendering anything (spec 0004). This is a convenience, never the
// security check: every page and action checks the session itself.
const signedInAreas = ["/account", "/dashboard", "/mfa", "/assistant"];

function needsSignIn(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const inArea = signedInAreas.some((area) => pathname === area || pathname.startsWith(`${area}/`));
  if (!inArea) return false;
  return !request.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("-auth-token"));
}

export async function proxy(request: NextRequest) {
  if (needsSignIn(request)) {
    const { pathname, search } = request.nextUrl;
    // Built from the site URL, never the request Host (spec 0004, AC-11).
    const target = new URL("/sign-in", publicEnv().NEXT_PUBLIC_SITE_URL);
    target.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(target);
  }
  return updateSession(request);
}

export const config = {
  // Skip static assets, image optimization, webhooks, and files with an extension.
  matcher: ["/((?!_next/static|_next/image|api/hooks/|favicon.ico|.*\\.[^/]+$).*)"],
};
