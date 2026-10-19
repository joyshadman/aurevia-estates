"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { toast } from "@/components/ui/toast";
import { listingFailureMessage, type ListingActionResult } from "@/lib/domain/listing-messages";

// The conflict token every action sends and the form keeps (spec 0005, AC-13).
// A result with `formStale` applied but missed someone else's edit: the form
// shows the stale message and keeps its old token, so its next save is refused
// instead of overwriting a change it never saw.

type EditorState = {
  token: string;
  stale: boolean;
  canEdit: boolean;
  // Applies a result: adopts the token or flags staleness, refreshes server data,
  // and toasts. Returns whether it succeeded.
  settle: (result: ListingActionResult, success?: string) => boolean;
};

const Context = createContext<EditorState | null>(null);

export function EditorProvider({ initialToken, canEdit, children }: { initialToken: string; canEdit: boolean; children: ReactNode }) {
  const router = useRouter();
  const [token, setToken] = useState(initialToken);
  const [stale, setStale] = useState(false);

  const settle = useCallback(
    (result: ListingActionResult, success?: string) => {
      if (!result.ok) {
        if (result.reason === "stale") setStale(true);
        toast({ tone: "danger", title: listingFailureMessage(result) });
        return false;
      }
      if (result.formStale) setStale(true);
      else setToken(result.updatedAt);
      if (success) toast({ tone: "success", title: success });
      router.refresh();
      return true;
    },
    [router],
  );

  const value = useMemo(() => ({ token, stale, canEdit, settle }), [token, stale, canEdit, settle]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useEditor() {
  const value = useContext(Context);
  if (!value) throw new Error("useEditor must be used inside EditorProvider");
  return value;
}
