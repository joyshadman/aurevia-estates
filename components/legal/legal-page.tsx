import Link from "next/link";
import { Container, Eyebrow } from "@/components/ui/layout";
import type { LegalDoc } from "@/lib/legal";

// The privacy and terms pages (spec 0017, AC-1): static text, no cookies, no session.
export function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <Container className="max-w-3xl py-12 sm:py-16">
      <Eyebrow>Last updated {doc.updated}</Eyebrow>
      <h1 className="mt-3 font-display text-4xl text-fg sm:text-5xl">{doc.title}</h1>
      <p className="mt-6 text-lg leading-relaxed text-fg-muted">{doc.intro}</p>
      <div className="mt-12 flex flex-col gap-10">
        {doc.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="font-display text-2xl text-fg">{section.heading}</h2>
            <div className="mt-3 flex flex-col gap-3 leading-relaxed text-fg-muted">
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
      <p className="mt-12 border-t border-line pt-6 text-sm text-fg-subtle">
        Questions? <Link href="/about#contact" className="text-accent hover:underline">Contact us</Link>.
      </p>
    </Container>
  );
}
