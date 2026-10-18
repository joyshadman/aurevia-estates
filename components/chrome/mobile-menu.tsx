"use client";

import { Menu as MenuIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useId, useState, type ReactNode } from "react";
import { Dialog } from "@/components/ui/dialog";
import type { NavEntry } from "@/lib/nav";

// Below `lg`, the header links move into a drawer (spec 0003).
export function MobileMenu({ links, footer }: { links: NavEntry[]; footer?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const drawerId = useId();
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls={drawerId}
        aria-label="Open menu"
        className="grid h-10 w-10 place-items-center rounded-full border border-line text-fg lg:hidden"
      >
        <MenuIcon aria-hidden="true" strokeWidth={1.5} className="h-5 w-5" />
      </button>
      <div id={drawerId}>
        <Dialog open={open} onClose={close} title="Menu" placement="right">
          <nav aria-label="Main" className="flex flex-col divide-y divide-line text-base">
            {links.map((link) => (
              <Link key={link.href} href={link.href} onClick={close} className="py-3 text-fg hover:text-accent">
                {link.label}
              </Link>
            ))}
          </nav>
          {footer ? <div className="mt-6 flex items-center gap-3">{footer}</div> : null}
        </Dialog>
      </div>
    </>
  );
}
