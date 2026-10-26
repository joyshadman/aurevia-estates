"use client";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { ErrorState } from "@/components/ui/state";
import { routes } from "@/lib/nav";

// The discovery page's error state (spec 0010, AC-6).
export default function PropertiesError({ retry }: { retry: () => void }) {
  return (
    <Container className="py-16">
      <ErrorState
        title="We couldn't load homes right now"
        body="This is on our side. Try again, or tell the assistant what you're looking for."
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Button type="button" onClick={() => retry()}>
              Try again
            </Button>
            <Button href={routes.assistant} intent="secondary">
              Open the assistant
            </Button>
          </div>
        }
      />
    </Container>
  );
}
