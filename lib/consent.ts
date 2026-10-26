"use client";

import { useSyncExternalStore } from "react";

// Cookie consent (spec 0017, *Consent store*). The choice lives in a first
// party cookie that only the browser reads and writes, so public pages never
// read cookies on the server and stay cacheable. No cookie: not chosen yet.

export type Consent = "analytics" | "essential";

const COOKIE = "aurevia_consent";
const MAX_AGE_SECONDS = 180 * 24 * 60 * 60;
const CHANGE_EVENT = "aurevia-consent";
const OPEN_EVENT = "aurevia-consent-open";

export function readConsent(): Consent | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)aurevia_consent=(analytics|essential)(?:;|$)/);
  return match ? (match[1] as Consent) : null;
}

// AC-3: kept 180 days; every listener hears the change at once.
export function writeConsent(value: Consent) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE}=${value}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

// `undefined` on the server and during hydration, so nothing flashes.
export function useConsent(): Consent | null | undefined {
  return useSyncExternalStore(subscribe, readConsent, () => undefined);
}

// The footer's "Cookie settings" (AC-3).
export function openConsentSettings() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function onOpenConsentSettings(handler: () => void) {
  window.addEventListener(OPEN_EVENT, handler);
  return () => window.removeEventListener(OPEN_EVENT, handler);
}
