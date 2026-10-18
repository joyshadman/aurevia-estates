"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

export type ToastTone = "info" | "success" | "danger";
type ToastItem = { id: number; tone: ToastTone; title: string; body?: string };

// Module level store: any client component can call `toast()` (spec 0003).
let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function toast(input: { tone?: ToastTone; title: string; body?: string }): number {
  const id = nextId++;
  items = [...items, { id, tone: input.tone ?? "info", title: input.title, body: input.body }];
  emit();
  return id;
}

export function dismissToast(id: number) {
  items = items.filter((item) => item.id !== id);
  emit();
}

// A modal dialog makes everything outside it inert, even top layer popovers, so a
// toast fired while a dialog is open must render inside that dialog. Open dialogs
// register a host element; the newest one receives the toasts.
let hosts: HTMLElement[] = [];

export function registerToastHost(element: HTMLElement): () => void {
  hosts = [...hosts, element];
  emit();
  return () => {
    hosts = hosts.filter((host) => host !== element);
    emit();
  };
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getItems = () => items;
const getServerItems = (): ToastItem[] => [];
const getHost = () => hosts.at(-1) ?? null;
const getServerHost = () => null;

const regionClass =
  "pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 md:items-end";

export function Toaster() {
  const current = useSyncExternalStore(subscribe, getItems, getServerItems);
  const host = useSyncExternalStore(subscribe, getHost, getServerHost);

  const regions = (
    <>
      <div aria-live="polite" className="flex w-full flex-col items-center gap-2 md:items-end">
        {current
          .filter((item) => item.tone !== "danger")
          .map((item) => (
            <ToastCard key={item.id} item={item} />
          ))}
      </div>
      <div role="alert" className="flex w-full flex-col items-center gap-2 md:items-end">
        {current
          .filter((item) => item.tone === "danger")
          .map((item) => (
            <ToastCard key={item.id} item={item} />
          ))}
      </div>
    </>
  );

  return host ? createPortal(regions, host) : <div className={regionClass}>{regions}</div>;
}

// Rendered inside each open Dialog; position: fixed, so it sits at the viewport
// edge like the page level toaster.
export function ToastHost() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => (ref.current ? registerToastHost(ref.current) : undefined), []);
  return <div ref={ref} className={regionClass} />;
}

const toneClass: Record<ToastTone, string> = {
  info: "border-line",
  success: "border-success",
  danger: "border-danger",
};

function ToastCard({ item }: { item: ToastItem }) {
  const paused = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Hover pauses auto dismiss (mouse convenience); focus pauses it for keyboards.
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const pause = () => (paused.current = true);
    const resume = () => (paused.current = false);
    card.addEventListener("mouseenter", pause);
    card.addEventListener("mouseleave", resume);
    card.addEventListener("focusin", pause);
    card.addEventListener("focusout", resume);
    return () => {
      card.removeEventListener("mouseenter", pause);
      card.removeEventListener("mouseleave", resume);
      card.removeEventListener("focusin", pause);
      card.removeEventListener("focusout", resume);
    };
  }, []);

  useEffect(() => {
    if (item.tone === "danger") return; // stays until closed
    let remaining = 5000;
    let started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      started = Date.now();
      timer = setTimeout(() => dismissToast(item.id), remaining);
    };
    const tick = setInterval(() => {
      if (paused.current && timer) {
        clearTimeout(timer);
        timer = undefined;
        remaining -= Date.now() - started;
      } else if (!paused.current && !timer) {
        run();
      }
    }, 200);
    run();
    return () => {
      clearInterval(tick);
      if (timer) clearTimeout(timer);
    };
  }, [item.id, item.tone]);

  return (
    <div
      ref={cardRef}
      className={cn(
        "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border bg-surface-raised p-4 text-fg shadow-lift",
        toneClass[item.tone],
      )}
    >
      <div className="flex-1">
        <p className="text-sm font-medium">{item.title}</p>
        {item.body ? <p className="mt-1 text-sm text-fg-muted">{item.body}</p> : null}
      </div>
      <button
        type="button"
        onClick={() => dismissToast(item.id)}
        className="grid h-8 w-8 place-items-center rounded-full text-fg-muted hover:bg-surface-sunken"
        aria-label="Dismiss notification"
      >
        <X aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
      </button>
    </div>
  );
}
