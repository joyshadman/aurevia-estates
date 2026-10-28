import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";
import { imageRemotePatterns, uploadedPhotoPattern } from "./lib/images";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Spec 0020: photo uploads go through a server action; the browser shrinks
  // them first, the server allows 4 MB plus form overhead.
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  images: {
    remotePatterns: imageRemotePatterns.map((pattern) => ({ ...pattern })),
    // Spec 0020, AC-5: uploaded photos, no query strings.
    localPatterns: [{ ...uploadedPhotoPattern }],
  },
  // Email links carry a live code (spec 0008, AC-2): never sent on as a
  // Referer, never cached.
  async headers() {
    return [
      {
        source: "/auth/confirm",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// Spec 0018, AC-4: source maps upload only when the Sentry build variables are
// set (Vercel production); otherwise the build skips the upload, quietly.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI || !process.env.SENTRY_AUTH_TOKEN,
  telemetry: false,
});
