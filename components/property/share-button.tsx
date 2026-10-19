"use client";

import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

// The phone's share sheet where it exists, else copy the link (spec 0009, AC-9).
// Cancelling the sheet does nothing.
export function ShareButton({ title, url, disabled }: { title: string; url: string; disabled?: boolean }) {
  async function share() {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
      } catch {
        // Cancelled, or the sheet failed: nothing to do.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast({ tone: "success", title: "Link copied" });
    } catch {
      toast({ tone: "danger", title: "Couldn't copy the link" });
    }
  }
  return (
    <Button intent="secondary" size="sm" onClick={share} disabled={disabled}>
      <Share2 aria-hidden="true" className="h-4 w-4" />
      Share
    </Button>
  );
}
