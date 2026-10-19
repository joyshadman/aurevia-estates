import "server-only";

// Error and event reporting for server code. Spec 0006 sends these to Sentry;
// Sentry arrives with the sign in feature (spec 0004), which points this file at
// it. Until then events go to the server log, with the same names and fields.

export function reportEvent(name: string, fields: Record<string, unknown>) {
  console.warn(`[event] ${name}`, fields);
}

export function reportError(error: unknown, fields: Record<string, unknown> = {}) {
  console.error("[error]", error, fields);
}
