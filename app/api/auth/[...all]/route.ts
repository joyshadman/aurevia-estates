import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/server/auth-config";

// Better Auth over HTTP (spec 0008). Only Google's callback, `/error`, and `/ok`
// answer here; every other path is closed in `auth-config.ts` (AC-4).
const handler = (request: Request) => getAuth().handler(request);

export const { GET, POST } = toNextJsHandler(handler);
