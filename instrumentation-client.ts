import * as Sentry from "@sentry/nextjs";
import { scrubAuthBreadcrumb, scrubAuthLinks } from "@/lib/sentry-scrub";

// Minimal browser error reporting (spec 0004). No session replay or tracing:
// those wait for cookie consent (features 17 and 18).
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  tracesSampleRate: 0,
  dataCollection: { userInfo: false, httpBodies: [] },
  // Email link codes never reach Sentry (spec 0008).
  beforeSend: scrubAuthLinks,
  beforeBreadcrumb: scrubAuthBreadcrumb,
});
