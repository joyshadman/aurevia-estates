"use client";

import { useEffect } from "react";
import { applyConsent } from "@/lib/analytics";
import { useConsent } from "@/lib/consent";

// Starts or stops PostHog as consent changes (spec 0018, AC-2). Renders nothing.
export function Analytics() {
  const consent = useConsent();
  useEffect(() => {
    if (consent !== undefined) void applyConsent();
  }, [consent]);
  return null;
}
