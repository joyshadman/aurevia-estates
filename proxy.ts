import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Skip static assets, image optimization, webhooks, and files with an extension.
  matcher: ["/((?!_next/static|_next/image|api/hooks/|favicon.ico|.*\\.[^/]+$).*)"],
};
