import Link from "next/link";
import { routes } from "@/lib/nav";

// Text logo from the mockup: arch mark, "Aurevia", and the eyebrow line.
export function Wordmark() {
  return (
    <Link href={routes.home} className="flex items-center gap-3 rounded-lg">
      <svg
        aria-hidden="true"
        viewBox="0 0 40 40"
        className="h-10 w-10 text-accent"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
      >
        <path d="M7 35V18a13 13 0 0 1 26 0v17" />
        <path d="M14 35V19.5a6 6 0 0 1 12 0V35" />
        <path d="M4 35h32" />
      </svg>
      <span className="leading-tight">
        <span className="block font-display text-xl tracking-wide text-fg">Aurevia</span>
        <span className="block text-[10px] tracking-[.18em] text-fg-subtle uppercase">Estates · Sylhet</span>
      </span>
      <span className="sr-only">, home</span>
    </Link>
  );
}
