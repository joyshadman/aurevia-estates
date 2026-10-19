import "server-only";
import { redirect } from "next/navigation";
import { remainingMessages } from "@/lib/server/ai-usage";
import { getCurrentUser } from "@/lib/server/auth";
import { listConversations } from "@/lib/server/conversations";
import { publishedListingCount } from "@/lib/server/listing-count";

// What both chat pages need besides the conversation itself. A signed out
// visitor goes to sign in and comes back here (spec 0004).
export async function chatPageBase(next: string) {
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  const [conversations, remaining, listingCount] = await Promise.all([
    listConversations(user),
    user.role === "VISITOR" ? remainingMessages(user.id) : Promise.resolve(null),
    publishedListingCount(),
  ]);
  return { user, conversations, remaining, listingCount };
}
