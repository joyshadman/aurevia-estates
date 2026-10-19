"use client";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { ErrorState } from "@/components/ui/state";

// A failure loading the search page (spec 0010, AC-10).
export default function SearchError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Container className="py-16">
      <ErrorState title="We couldn't load these homes" body="Please try again in a moment." action={<Button onClick={reset}>Try again</Button>} />
    </Container>
  );
}
