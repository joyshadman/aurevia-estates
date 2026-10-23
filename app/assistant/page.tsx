import type { Metadata } from "next";
import { Suspense } from "react";
import { Container } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/lib/nav";
import { chatMessagesLeft } from "@/lib/server/ai-usage";
import { requireUser } from "@/lib/server/auth";
import { ChatView } from "./chat-view";

export const metadata: Metadata = { title: "AI Assistant" };

// `/assistant` (spec 0006): a new, empty chat. Signed in users only (spec 0008).
export default function AssistantPage() {
  return (
    <Container className="max-w-4xl">
      <Suspense fallback={<Skeleton className="mt-8 h-64 w-full" />}>
        <NewChat />
      </Suspense>
    </Container>
  );
}

async function NewChat() {
  const user = await requireUser({ next: routes.assistant });
  // Agents have no daily limit (spec 0006, AC-9).
  const remaining = user.role === "VISITOR" ? await chatMessagesLeft(user.id) : null;
  return <ChatView initialMessages={[]} initialCards={{}} initialRemaining={remaining} />;
}
