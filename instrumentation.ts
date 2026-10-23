import * as Sentry from "@sentry/nextjs";

// Runs once when a server instance starts. Validates env up front so a missing
// variable fails at boot rather than on the first request that needs it.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    const { serverEnv } = await import("@/lib/server/env");
    const { publicEnv } = await import("@/lib/env");
    serverEnv();
    publicEnv();
  }
}

// Unhandled server errors in pages, actions, and route handlers.
export const onRequestError = Sentry.captureRequestError;
