import Link from "next/link";
import { Suspense } from "react";
import { liveNav } from "@/lib/nav";
import { Container } from "@/components/ui/layout";
import { AccountSlot, AccountSlotSkeleton } from "@/components/chrome/account-slot";
import { MobileMenu } from "@/components/chrome/mobile-menu";
import { ThemeToggle } from "@/components/chrome/theme-toggle";
import { Wordmark } from "@/components/chrome/wordmark";

// Static, cacheable shell. The account slot is the only part that reads the
// session, streamed in behind Suspense (spec 0003 AC-6).
export function SiteHeader() {
  const links = liveNav("header");

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
      <Container className="flex h-20 items-center justify-between gap-4">
        <Wordmark />
        <nav aria-label="Main" className="hidden items-center gap-8 text-sm text-fg-muted lg:flex">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="transition-colors duration-fast hover:text-accent">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          {/* Below `lg` the theme toggle moves into the mobile menu, so Sign in fits on the smallest screens. */}
          <ThemeToggle className="max-lg:hidden" />
          <Suspense fallback={<AccountSlotSkeleton />}>
            <AccountSlot />
          </Suspense>
          <MobileMenu
            links={links}
            footer={
              <>
                <span className="text-sm text-fg-muted">Theme</span>
                <ThemeToggle />
              </>
            }
          />
        </div>
      </Container>
    </header>
  );
}
