"use client";

import { Building2, LayoutDashboard, MessageSquareText, ScrollText, Star, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

// Properties and Leads (spec 0005, *Pages*), Overview (spec 0022), and the
// Featured preview (spec 0023, a placeholder until payments are designed), and
// the assistant's fact sheet (spec 0006, AC-14).
const items: { label: string; href: string; icon: LucideIcon; live: boolean }[] = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard, live: true },
  { label: "Properties", href: "/dashboard/listings", icon: Building2, live: true },
  { label: "Leads", href: "/dashboard/leads", icon: MessageSquareText, live: true },
  { label: "Featured", href: "/dashboard/featured", icon: Star, live: true },
  { label: "Assistant facts", href: "/dashboard/assistant-facts", icon: ScrollText, live: true },
];

// The active link needs the URL, which streams in on dynamic routes; the
// layout shows `DashboardNavLinks` with no active link until it arrives.
export function DashboardNav() {
  return <DashboardNavLinks pathname={usePathname()} />;
}

export function DashboardNavLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Dashboard" className="flex gap-1 overflow-x-auto lg:mt-6 lg:flex-col">
      {items
        .filter((item) => item.live)
        .map(({ label, href, icon: Icon }) => {
          // Overview is the parent of every page, so it matches only itself.
          const active = pathname !== null && (pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`)));
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-3 rounded-full px-4 py-2 text-sm font-medium transition-colors duration-fast",
                active ? "bg-accent-subtle text-accent-subtle-fg" : "text-fg-muted hover:bg-surface-sunken hover:text-fg",
              )}
            >
              <Icon aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
    </nav>
  );
}
