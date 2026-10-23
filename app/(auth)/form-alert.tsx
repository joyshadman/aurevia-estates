import type { ReactNode } from "react";

// A form level failure on the sign in pages, with an optional action beside it.
export function FormAlert({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-danger-subtle px-4 py-3 text-sm text-danger-subtle-fg"
    >
      <p>{message}</p>
      {children}
    </div>
  );
}
