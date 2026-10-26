"use client";

import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FavoriteButton } from "@/components/listing/favorite-button";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { loadSavedSlugs, saveHome, unsaveHome } from "./actions";

// Hearts on public pages (spec 0014, *Public pages stay cacheable*). Pages read
// no cookies; the first heart on a page asks once for the user's saved homes.

type Status = "idle" | "loading" | "ready" | "signed_out";

type Store = {
  status: Status;
  saved: Set<string>;
  pending: Set<string>;
  ensureLoaded: () => void;
  toggle: (slug: string) => void;
};

const SavedHomesContext = createContext<Store | null>(null);

export function SavedHomesProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const started = useRef(false);

  const ensureLoaded = useCallback(() => {
    if (started.current) return;
    started.current = true;
    setStatus("loading");
    loadSavedSlugs()
      .then((result) => {
        if (result.ok) {
          setSaved(new Set(result.slugs));
          setStatus("ready");
        } else {
          setStatus("signed_out");
        }
      })
      .catch(() => {
        // Let the next heart try again.
        started.current = false;
        setStatus("idle");
      });
  }, []);

  // AC-2: signed out, a heart goes to sign in and comes back here. The path is
  // read at click time, not with `usePathname`, which would suspend this root
  // provider while dynamic routes prerender.
  const signIn = useCallback(() => {
    const here = `${window.location.pathname}${window.location.search}`;
    router.push(`/sign-in?${new URLSearchParams({ next: here })}`);
  }, [router]);

  const toggle = useCallback(
    (slug: string) => {
      if (status === "signed_out") return signIn();
      const wasSaved = saved.has(slug);
      const flip = (on: boolean) =>
        setSaved((current) => {
          const next = new Set(current);
          if (on) next.add(slug);
          else next.delete(slug);
          return next;
        });
      flip(!wasSaved);
      setPending((current) => new Set(current).add(slug));
      (wasSaved ? unsaveHome : saveHome)({ slug })
        .then((result) => {
          if (result.ok) return;
          flip(wasSaved);
          if (result.reason === "signed_out") {
            setStatus("signed_out");
            signIn();
          } else {
            toast({ tone: "danger", title: "This home can't be saved right now." });
          }
        })
        .catch(() => {
          flip(wasSaved);
          toast({ tone: "danger", title: "Couldn't update your saved homes. Try again." });
        })
        .finally(() =>
          setPending((current) => {
            const next = new Set(current);
            next.delete(slug);
            return next;
          }),
        );
    },
    [saved, signIn, status],
  );

  const store = useMemo(() => ({ status, saved, pending, ensureLoaded, toggle }), [status, saved, pending, ensureLoaded, toggle]);
  return <SavedHomesContext.Provider value={store}>{children}</SavedHomesContext.Provider>;
}

function useSavedHome(slug: string) {
  const store = useContext(SavedHomesContext);
  if (!store) throw new Error("SaveHomeButton needs SavedHomesProvider (app/layout.tsx)");
  const { ensureLoaded } = store;
  useEffect(() => ensureLoaded(), [ensureLoaded]);
  return {
    pressed: store.saved.has(slug),
    pending: store.pending.has(slug) || store.status === "loading",
    toggle: () => store.toggle(slug),
  };
}

// AC-1: the heart on a card (`icon`) or a labelled button (property page).
export function SaveHomeButton({ slug, variant = "icon", className }: { slug: string; variant?: "icon" | "button"; className?: string }) {
  const { pressed, pending, toggle } = useSavedHome(slug);
  if (variant === "icon") return <FavoriteButton pressed={pressed} pending={pending} onToggle={toggle} className={className} />;
  return (
    <Button type="button" intent="secondary" size="sm" aria-pressed={pressed} disabled={pending} onClick={toggle} className={className}>
      <Heart aria-hidden="true" strokeWidth={1.6} className={cn("h-4 w-4 text-accent", pressed && "fill-current")} />
      {pressed ? "Saved" : "Save"}
    </Button>
  );
}
