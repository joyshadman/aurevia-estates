"use client";

import { useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";
import { searchHref, type SearchState } from "@/lib/domain/search-params";

// Moves to a new search (spec 0010, AC-8): push for a control change, replace
// while typing. Kept in a transition, so the current results stay on screen
// (and focus stays on the control) until the new ones arrive.
export function useSearchNav() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const go = useCallback(
    (state: SearchState, mode: "push" | "replace" = "push") => {
      startTransition(() => {
        router[mode](searchHref(state), { scroll: false });
      });
    },
    [router],
  );
  return { go, pending };
}
