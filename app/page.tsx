import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container, Eyebrow } from "@/components/ui/layout";
import { routes } from "@/lib/nav";

// Placeholder until the homepage (feature 12) is built.
export default function HomePage() {
  return (
    <Container className="flex flex-1 flex-col items-start justify-center gap-6 py-24">
      <Eyebrow>Sylhet · hand checked homes</Eyebrow>
      <h1 className="max-w-2xl font-display text-4xl leading-tight text-fg sm:text-5xl">
        Tell us how your family lives. We&apos;ll find the home that fits.
      </h1>
      <p className="max-w-xl text-base text-fg-muted">
        The Aurevia Assistant asks about your budget, neighbourhoods, and must haves, in English or বাংলা, then
        shows only real, verified listings.
      </p>
      <Button href={routes.assistant} size="lg">
        <Sparkles aria-hidden="true" strokeWidth={1.5} className="h-5 w-5" />
        Talk to the assistant
      </Button>
    </Container>
  );
}
