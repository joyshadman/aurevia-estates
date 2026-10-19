import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/state";

// The site's not found page (spec 0009, AC-3); Next.js adds noindex.
export default function NotFound() {
  return (
    <Container className="py-20">
      <EmptyState
        title="We couldn't find that page"
        body="The home may have been sold or taken off the market, or the link may be mistyped."
        action={<Button href="/">Back to the homepage</Button>}
      />
    </Container>
  );
}
