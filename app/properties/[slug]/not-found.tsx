import { SearchX, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/state";
import { discoveryPath } from "@/lib/domain/discovery";
import { routes } from "@/lib/nav";

// An unknown, sold, or unpublished home (spec 0012, AC-1).
export default function ListingNotFound() {
  return (
    <Container className="py-16">
      <EmptyState
        icon={SearchX}
        title="This home isn't listed right now"
        body="It may have sold or been taken off the market. Browse the homes we have, or tell the assistant what you're looking for."
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Button href={discoveryPath}>Browse homes</Button>
            <Button href={routes.assistant} intent="secondary">
              <Sparkles aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
              Ask the assistant
            </Button>
          </div>
        }
      />
    </Container>
  );
}
