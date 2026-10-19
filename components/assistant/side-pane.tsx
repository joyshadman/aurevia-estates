"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useSavedHomes } from "@/components/listing/saved-store";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import type { ChatSavedHome } from "@/lib/server/saved-homes";
import { chatSavedAction } from "@/app/saved/actions";

const tabs = ["Conversations", "Saved"] as const;
type Tab = (typeof tabs)[number];

// The chat's left pane: Conversations and Saved tabs (spec 0013), with the
// ARIA tabs pattern (arrow keys move between tabs, automatic activation).
export function SidePane({ conversations }: { conversations: ReactNode }) {
  const id = useId();
  const [tab, setTab] = useState<Tab>("Conversations");
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = tabs.length - 1;
    const next = e.key === "ArrowRight" ? (index === last ? 0 : index + 1) : e.key === "ArrowLeft" ? (index === 0 ? last : index - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : null;
    if (next === null) return;
    e.preventDefault();
    setTab(tabs[next]);
    refs.current[next]?.focus();
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Side pane" className="flex rounded-full border border-line-strong p-0.5">
        {tabs.map((name, i) => (
          <button
            key={name}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${i}`}
            aria-selected={tab === name}
            aria-controls={`${id}-panel-${i}`}
            tabIndex={tab === name ? 0 : -1}
            onClick={() => setTab(name)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "flex-1 rounded-full px-3 py-1.5 text-sm transition duration-fast",
              tab === name ? "bg-accent text-on-accent" : "text-fg-muted hover:text-fg",
            )}
          >
            {name}
          </button>
        ))}
      </div>
      {tabs.map((name, i) => (
        <div key={name} role="tabpanel" id={`${id}-panel-${i}`} aria-labelledby={`${id}-tab-${i}`} hidden={tab !== name}>
          {name === "Conversations" ? conversations : tab === "Saved" ? <SavedHomes /> : null}
        </div>
      ))}
    </div>
  );
}

// Saved available homes, newest first, up to 20; refetched when any heart
// changes (the store's version bumps on each confirmed save or unsave).
function SavedHomes() {
  const { version } = useSavedHomes();
  const [homes, setHomes] = useState<ChatSavedHome[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    chatSavedAction()
      .then((rows) => {
        if (!live) return;
        setHomes(rows);
        setFailed(false);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [version]);

  if (failed && !homes) return <p className="text-sm text-danger">Couldn&apos;t load your saved homes.</p>;
  if (!homes) return <p className="text-sm text-fg-muted">Loading…</p>;
  if (homes.length === 0) return <p className="text-sm text-fg-muted">Homes you save with the heart appear here.</p>;
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-1">
        {homes.map((home) => (
          <li key={home.listingId}>
            <Link href={`/properties/${home.slug}`} className="block rounded-xl px-3 py-2 text-sm hover:bg-surface-sunken">
              <span className="block truncate text-fg">{home.title}</span>
              <span className="block text-xs text-fg-subtle">
                {home.areaName} · {formatPrice(home.priceBdt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/saved" className="px-3 text-sm text-accent hover:underline">
        All saved homes
      </Link>
    </div>
  );
}
