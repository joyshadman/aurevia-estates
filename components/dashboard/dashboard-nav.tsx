"use client";

import { Building2, Inbox, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { cn } from "@/lib/cn";

// The dashboard sidebar from the admin mockup. Only live sections show (slice 1:
// Properties, Leads, Assistant facts; Overview arrives with feature 22).
const links = [
  { href: "/dashboard/listings", label: "Properties", icon: Building2 },
  { href: "/dashboard/leads", label: "Leads", icon: Inbox },
  { href: "/dashboard/assistant-facts", label: "Assistant facts", icon: Sparkles },
];

// The pathname is request data, so the active state streams in behind Suspense;
// the prerendered shell shows the same links without it.
export function DashboardNav() {
  return (
    <Suspense fallback={<NavLinks pathname={null} />}>
      <ActiveNav />
    </Suspense>
  );
}

function ActiveNav() {
  return <NavLinks pathname={usePathname()} />;
}

function NavLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Dashboard" className="flex gap-2 lg:flex-col">
      {links.map(({ href, label, icon: Icon }) => {
        const active = pathname !== null && (pathname === href || pathname.startsWith(`${href}/`));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-fast",
              active ? "bg-accent-subtle font-medium text-accent-subtle-fg" : "text-fg-muted hover:bg-surface-sunken hover:text-fg",
            )}
          >
            <Icon aria-hidden="true" strokeWidth={1.5} className="h-5 w-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
