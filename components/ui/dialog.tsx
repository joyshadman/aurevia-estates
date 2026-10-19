"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ToastHost } from "@/components/ui/toast";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  // `center` for dialogs; `right` for drawers; `bottom` for mobile sheets (the chat brief).
  placement?: "center" | "right" | "bottom";
  className?: string;
};

// Native <dialog> with showModal(): focus stays inside, Escape closes, the page
// behind is inert. Backdrop click and focus return are added here (spec 0003).
export function Dialog({ open, onClose, title, description, children, footer, placement = "center", className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocusTo.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleClose = () => {
      onClose();
      returnFocusTo.current?.focus?.();
    };
    // A click whose target is the dialog element itself landed on the backdrop.
    // Mouse only convenience; Escape is the native keyboard equivalent.
    const handleBackdrop = (event: MouseEvent) => {
      if (event.target === dialog) dialog.close();
    };
    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("click", handleBackdrop);
    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("click", handleBackdrop);
    };
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={cn(
        "bg-surface-raised p-0 text-fg shadow-lift open:flex open:flex-col",
        placement === "center" && "m-auto max-h-[85vh] w-[calc(100%-2rem)] max-w-lg rounded-2xl",
        placement === "right" && "my-0 mr-0 ml-auto h-full max-h-none w-[min(22rem,100%)] rounded-none",
        placement === "bottom" && "mx-0 mt-auto mb-0 max-h-[80vh] w-full max-w-none rounded-t-2xl",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
        <div>
          <h2 id={titleId} className="font-display text-xl">
            {title}
          </h2>
          {description ? (
            <div id={descriptionId} className="mt-1 text-sm text-fg-muted">
              {description}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => ref.current?.close()}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-fg-muted hover:bg-surface-sunken"
          aria-label="Close"
        >
          <X aria-hidden="true" strokeWidth={1.5} className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      {footer ? <div className="flex justify-end gap-3 border-t border-line px-6 py-4">{footer}</div> : null}
      {open ? <ToastHost /> : null}
    </dialog>
  );
}
