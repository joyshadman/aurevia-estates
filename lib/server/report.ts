import "server-only";
import * as Sentry from "@sentry/nextjs";

// Error and event reporting through Sentry (spec 0001; minimal init in
// `sentry.server.config.ts`). With no DSN set, Sentry is off and these only log.

export function reportError(event: string, error: unknown, context: Record<string, unknown> = {}) {
  console.error(`[${event}]`, error, context);
  Sentry.captureException(error, { tags: { event }, extra: context });
}

export function reportEvent(event: string, context: Record<string, unknown> = {}) {
  console.warn(`[${event}]`, context);
  Sentry.captureMessage(event, { level: "warning", extra: context });
}
