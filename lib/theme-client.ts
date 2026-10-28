"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_THEME,
  THEME_EVENT,
  THEME_PENDING_KEY,
  THEME_STORAGE_KEY,
  isThemePreference,
  type ThemePreference,
} from "@/lib/theme";

// The one theme store in the browser (spec 0003). It owns the system listener and
// cross tab sync; components read it through `useThemePreference`.

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode): the theme still applies for this page.
  }
}

export function getStoredPreference(): ThemePreference {
  const value = readStorage(THEME_STORAGE_KEY);
  return isThemePreference(value) ? value : DEFAULT_THEME;
}

function systemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyPreference(pref: ThemePreference) {
  const dark = pref === "dark" || (pref === "system" && systemPrefersDark());
  const root = document.documentElement;
  root.setAttribute("data-theme", dark ? "dark" : "light");
  root.setAttribute("data-theme-pref", pref);
  root.style.colorScheme = dark ? "dark" : "light";
}

export function setPreference(pref: ThemePreference) {
  writeStorage(THEME_STORAGE_KEY, pref);
  applyPreference(pref);
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function isSavePending() {
  return readStorage(THEME_PENDING_KEY) === "1";
}

export function setSavePending(pending: boolean) {
  writeStorage(THEME_PENDING_KEY, pending ? "1" : null);
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    if (getStoredPreference() === "system") applyPreference("system");
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    applyPreference(getStoredPreference());
    onChange();
  };
  media.addEventListener("change", onSystem);
  window.addEventListener("storage", onStorage);
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    media.removeEventListener("change", onSystem);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(THEME_EVENT, onChange);
  };
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, getStoredPreference, () => DEFAULT_THEME);
}
