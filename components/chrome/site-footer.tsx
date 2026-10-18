import Link from "next/link";
import { liveNav } from "@/lib/nav";
import { Container } from "@/components/ui/layout";
import { Wordmark } from "@/components/chrome/wordmark";

export function SiteFooter() {
  const links = liveNav("footer");

  return (
    <footer className="mt-auto border-t border-line bg-surface-raised">
      <Container className="flex flex-col gap-8 py-12 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-sm">
          <Wordmark />
          <p className="mt-4 text-sm text-fg-muted">
            Hand checked homes across Sylhet, matched to your family by the Aurevia Assistant.
          </p>
        </div>
        {links.length > 0 ? (
          <nav aria-label="Footer" className="flex flex-col gap-3 text-sm">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="text-fg-muted hover:text-accent">
                {link.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </Container>
      <Container className="border-t border-line py-6 text-xs text-fg-subtle">
        Aurevia Estates, Sylhet
      </Container>
    </footer>
  );
}
