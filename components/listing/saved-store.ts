"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { toast } from "@/components/ui/toast";
import { saveHomeAction, savedListingIdsAction } from "@/app/saved/actions";

// One store for every heart on the page (spec 0013). Pages render without saved
// state so they stay cached; the first heart to mount asks the server once.

type SavedState = {
  status: "idle" | "loading" | "ready";
  // Who the ids belong to; null when signed out.
  userId: string | null;
  ids: ReadonlySet<string>;
  pending: ReadonlySet<string>;
  // Bumped on every confirmed change, so lists like the chat's Saved tab refetch.
  version: number;
};

const initial: SavedState = { status: "idle", userId: null, ids: new Set(), pending: new Set(), version: 0 };
let state = initial;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: Partial<SavedState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function load(): Promise<void> {
  loading ??= (async () => {
    set({ status: "loading" });
    try {
      const result = await savedListingIdsAction();
      set({ status: "ready", userId: result.userId, ids: new Set(result.ids) });
    } catch {
      // Hearts stay empty; pressing one tries again.
      loading = null;
      set({ status: "idle" });
    }
  })();
  return loading;
}

function signInHref() {
  return `/sign-in?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`;
}

const failures = {
  limit: "You can save up to 200 homes. Remove one to save another.",
  not_found: "This home is no longer available to save.",
} as const;

// `navigate` is the router's push: signed out, a heart goes to sign in.
export async function toggleSaved(listingId: string, navigate: (href: string) => void) {
  if (state.status !== "ready") await load();
  if (state.status !== "ready") {
    toast({ tone: "danger", title: "Couldn't save this home. Please try again." });
    return;
  }
  if (!state.userId) return navigate(signInHref());
  if (state.pending.has(listingId)) return;

  const saved = !state.ids.has(listingId);
  const apply = (on: boolean) => {
    const ids = new Set(state.ids);
    if (on) ids.add(listingId);
    else ids.delete(listingId);
    return ids;
  };
  set({ ids: apply(saved), pending: new Set(state.pending).add(listingId) });

  let result: Awaited<ReturnType<typeof saveHomeAction>> | null = null;
  try {
    result = await saveHomeAction({ listingId, saved });
  } catch {
    result = null;
  }
  const pending = new Set(state.pending);
  pending.delete(listingId);
  if (result?.ok) {
    set({ pending, version: state.version + 1 });
    return;
  }
  // Revert the optimistic change (spec 0013).
  set({ ids: apply(!saved), pending });
  if (result?.reason === "signed_out") return navigate(signInHref());
  const reason = result && (result.reason === "limit" || result.reason === "not_found") ? result.reason : null;
  toast({ tone: "danger", title: reason ? failures[reason] : "Couldn't update your saved homes. Please try again." });
}

// The store outlives client navigations, so the header reports who is signed in
// on every render; a different person (sign in, sign out) reloads the ids.
export function syncSavedUser(userId: string | null) {
  if (state.status !== "ready" || state.userId === userId) return;
  loading = null;
  state = { ...initial, version: state.version + 1 };
  void load();
}

const serverSnapshot = () => initial;

export function useSavedHomes() {
  const router = useRouter();
  const snapshot = useSyncExternalStore(subscribe, () => state, serverSnapshot);
  useEffect(() => {
    void load();
  }, []);
  return { ...snapshot, toggle: (listingId: string) => void toggleSaved(listingId, router.push) };
}
