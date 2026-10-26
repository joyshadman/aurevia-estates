import * as Sentry from "@sentry/nextjs";
import { scrubAuthBreadcrumb, scrubAuthLinks } from "@/lib/sentry-scrub";

// Browser error reporting (spec 0004, spec 0018). No session replay or tracing,
// by spec 0018: errors only, no cookies, no user info.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  // Spec 0018, AC-4.
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
  tracesSampleRate: 0,
  dataCollection: { userInfo: false, httpBodies: [] },
  // Email link codes never reach Sentry (spec 0008).
  beforeSend: scrubAuthLinks,
  beforeBreadcrumb: scrubAuthBreadcrumb,
});
