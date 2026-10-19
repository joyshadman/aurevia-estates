"use client";

import { useEffect } from "react";
import { syncSavedUser } from "@/components/listing/saved-store";

// Rendered by the header's account slot (spec 0013): keeps hearts in step with
// the session after a sign in or sign out that never reloads the page.
export function SavedSession({ userId }: { userId: string | null }) {
  useEffect(() => syncSavedUser(userId), [userId]);
  return null;
}
