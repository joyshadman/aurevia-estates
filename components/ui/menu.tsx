"use client";

import { Check } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

const MenuContext = createContext<{ close: () => void } | null>(null);

type MenuProps = {
  // Accessible name of the trigger (it may show only an icon).
  label: string;
  trigger: ReactNode;
  triggerClassName?: string;
  align?: "start" | "end";
  children: ReactNode;
};

const ITEM_SELECTOR = '[role="menuitem"],[role="menuitemradio"]';

// Popover API menu opened with `popovertarget`, so Escape and outside clicks close
// it natively and Escape returns focus to the trigger. Positioned in script below
// the trigger (no CSS anchor positioning); on small screens it is a bottom sheet.
export function Menu({ label, trigger, triggerClassName, align = "end", children }: MenuProps) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);

  const close = useCallback(() => {
    try {
      menuRef.current?.hidePopover();
    } catch {
      // already closed
    }
    triggerRef.current?.focus();
  }, []);

  const position = () => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    if (window.matchMedia("(max-width: 639px)").matches) {
      menu.style.removeProperty("top");
      menu.style.removeProperty("left");
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    let left = align === "end" ? rect.right - width : rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    let top = rect.bottom + 8;
    if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 8);
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
  };

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);

  const onToggle = (event: React.ToggleEvent<HTMLDivElement>) => {
    const open = event.newState === "open";
    setExpanded(open);
    if (open) {
      position();
      const list = items();
      (list.find((el) => el.getAttribute("aria-checked") === "true") ?? list[0])?.focus();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    const moveTo = (next: number) => {
      event.preventDefault();
      list[(next + list.length) % list.length]?.focus();
    };
    if (event.key === "ArrowDown") moveTo(index + 1);
    else if (event.key === "ArrowUp") moveTo(index - 1);
    else if (event.key === "Home") moveTo(0);
    else if (event.key === "End") moveTo(list.length - 1);
    else if (event.key === "Tab") close();
  };

  return (
    <MenuContext.Provider value={{ close }}>
      <button
        ref={triggerRef}
        type="button"
        popoverTarget={id}
        aria-haspopup="menu"
        aria-expanded={expanded}
        aria-controls={id}
        aria-label={typeof trigger === "string" ? undefined : label}
        className={triggerClassName}
      >
        {trigger}
      </button>
      <div
        ref={menuRef}
        id={id}
        popover="auto"
        role="menu"
        tabIndex={-1}
        aria-label={label}
        onToggle={onToggle}
        onKeyDown={onKeyDown}
        className={cn(
          "fixed m-0 min-w-52 rounded-2xl border border-line bg-surface-raised p-1.5 text-fg shadow-lift",
          "max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:pb-6",
        )}
      >
        {children}
      </div>
    </MenuContext.Provider>
  );
}

const itemClass =
  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-fg hover:bg-surface-sunken focus:bg-surface-sunken focus:outline-none";

export function MenuItem({
  onSelect,
  href,
  children,
}: {
  onSelect?: () => void;
  href?: string;
  children: ReactNode;
}) {
  const ctx = useContext(MenuContext);
  if (href) {
    return (
      <a role="menuitem" tabIndex={-1} href={href} className={itemClass} onClick={() => ctx?.close()}>
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      className={itemClass}
      onClick={() => {
        onSelect?.();
        ctx?.close();
      }}
    >
      {children}
    </button>
  );
}

export function MenuItemRadio({
  checked,
  onSelect,
  children,
}: {
  checked: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  const ctx = useContext(MenuContext);
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      tabIndex={-1}
      className={itemClass}
      onClick={() => {
        onSelect();
        ctx?.close();
      }}
    >
      <span className="flex-1">{children}</span>
      {checked ? <Check aria-hidden="true" strokeWidth={1.5} className="h-4 w-4 text-accent" /> : null}
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-3 pt-2 pb-1 text-xs text-fg-subtle">{children}</div>;
}

export function MenuSeparator() {
  return <div role="separator" className="my-1.5 h-px bg-line" />;
}
