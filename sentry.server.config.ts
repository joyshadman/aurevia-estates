import * as Sentry from "@sentry/nextjs";
import { scrubAuthBreadcrumb, scrubAuthLinks } from "@/lib/sentry-scrub";

// Minimal server error reporting (spec 0004; feature 18 adds tracing and source
// maps). Off when SENTRY_DSN is unset, so local runs report nothing.
Sentry.init({
  dsn: process.env.SENTRY_DSN || undefined,
  enabled: Boolean(process.env.SENTRY_DSN),
  // Spec 0018, AC-4: production and preview errors stay apart.
  environment: process.env.VERCEL_ENV ?? "development",
  tracesSampleRate: 0,
  // Chat text, emails, and phone numbers are personal data: never send user info or bodies.
  dataCollection: { userInfo: false, httpBodies: [] },
  // Email link codes never reach Sentry (spec 0008).
  beforeSend: scrubAuthLinks,
  beforeBreadcrumb: scrubAuthBreadcrumb,
});
