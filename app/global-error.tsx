"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import "./globals.css";

// A render error in the root layout itself (spec 0018, AC-4). It replaces the
// whole document, so it brings its own <html> and stays plain.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en" data-theme="light">
      <body className="flex min-h-screen items-center justify-center bg-surface p-6 text-fg">
        <main className="max-w-md text-center">
          <h1 className="font-display text-3xl">Something went wrong</h1>
          <p className="mt-3 text-fg-muted">We&apos;ve been told about it. Please try again.</p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 rounded-full bg-accent px-6 py-3 text-sm font-medium text-on-accent hover:bg-accent-hover"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
