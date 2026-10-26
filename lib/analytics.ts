"use client";

import type { PostHog } from "posthog-js";
import { analyticsEnv } from "@/lib/env";
import { readConsent } from "@/lib/consent";

// Funnel events (spec 0018). PostHog loads only after the visitor allows
// analytics (spec 0017), never identifies anyone, and every event goes
// through `track()`, which does nothing without consent.

export type FunnelEvent =
  | { name: "chat_started"; props: { from_listing: boolean } }
  | { name: "listing_recommended"; props: { count: number; ref_codes: string[] } }
  | { name: "viewing_booked"; props: { ref_code: string } };

let client: Promise<PostHog | null> | null = null;

function load(): Promise<PostHog | null> {
  const env = analyticsEnv();
  if (!env) return Promise.resolve(null);
  client ??= import("posthog-js").then(({ default: posthog }) => {
    posthog.init(env.key, {
      api_host: env.host,
      // No person profiles: we never call identify, so no email or name reaches PostHog.
      person_profiles: "identified_only",
      capture_pageview: "history_change",
      autocapture: false,
      disable_session_recording: true,
      persistence: "localStorage+cookie",
    });
    return posthog;
  });
  return client;
}

// Called whenever consent changes (AC-2).
export async function applyConsent() {
  if (readConsent() === "analytics") {
    const posthog = await load();
    if (posthog?.has_opted_out_capturing()) posthog.opt_in_capturing();
    return;
  }
  // Revoked: stop at once and clear PostHog's storage (spec 0017, AC-3).
  if (!client) return;
  const posthog = await client;
  posthog?.opt_out_capturing();
  posthog?.reset();
}

export function track(event: FunnelEvent) {
  if (readConsent() !== "analytics") return;
  void load().then((posthog) => posthog?.capture(event.name, event.props));
}
