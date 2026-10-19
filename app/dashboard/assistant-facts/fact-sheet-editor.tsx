"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ReplyText } from "@/components/assistant/reply-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { restoreFactSheetAction, saveFactSheetAction } from "./actions";

type Version = { id: string; body: string; createdAt: string; restored: boolean; author: string };

const maxLength = 4000;
const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" });

const failures: Record<string, string> = {
  stale: "Someone saved a newer version. Reload to see it, then make your change again.",
  invalid: "Write 1 to 4,000 characters.",
  not_found: "That version no longer exists.",
  forbidden: "Only agents can change the assistant facts.",
  signed_out: "Your session ended. Sign in again.",
  mfa_required: "Confirm your authenticator code to continue.",
};

// Edit, preview, and restore (spec 0006, AC-14). Each save is a new version
// based on the live one; the newest is live for the next reply.
export function FactSheetEditor({ versions }: { versions: Version[] }) {
  const router = useRouter();
  const live = versions[0] ?? null;
  const [body, setBody] = useState(live?.body ?? "");
  const [preview, setPreview] = useState(false);
  const [pending, startTransition] = useTransition();
  const changed = body.trim() !== (live?.body ?? "").trim();

  function settle(result: { ok: true; id: string } | { ok: false; reason: string; message?: string }, success: string) {
    if (!result.ok) {
      toast({ tone: "danger", title: result.message ?? failures[result.reason] ?? "Something went wrong." });
      return;
    }
    toast({ tone: "success", title: success });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <section className="flex min-w-0 flex-1 flex-col gap-4 rounded-2xl border border-line bg-surface-raised p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl text-fg">{preview ? "Preview" : "Edit"}</h2>
          <Button size="sm" intent="ghost" onClick={() => setPreview((p) => !p)} aria-pressed={preview}>
            {preview ? "Back to editing" : "Preview"}
          </Button>
        </div>
        {preview ? (
          <ReplyText text={body} className="min-h-64 text-sm leading-relaxed text-fg" />
        ) : (
          <Field id="fact-sheet" label="Assistant facts" hint={`${body.length.toLocaleString("en-US")} of 4,000 characters. Plain text with - lists and **bold**.`}>
            <Textarea rows={18} maxLength={maxLength} value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
        )}
        <div className="flex justify-end gap-3">
          <Button intent="ghost" onClick={() => setBody(live?.body ?? "")} disabled={!changed || pending}>
            Discard changes
          </Button>
          <Button
            loading={pending}
            disabled={!changed || !body.trim()}
            onClick={() =>
              startTransition(async () => settle(await saveFactSheetAction({ body, previousId: live?.id ?? null }), "Saved. It's live for the next reply."))
            }
          >
            Save
          </Button>
        </div>
      </section>

      <aside className="flex flex-col gap-3 rounded-2xl border border-line bg-surface-raised p-6 lg:w-80">
        <h2 className="font-display text-xl text-fg">Versions</h2>
        <ol className="flex flex-col divide-y divide-line">
          {versions.map((version, index) => (
            <li key={version.id} className="flex flex-col gap-1 py-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-fg">{when.format(new Date(version.createdAt))}</span>
                {index === 0 ? <Badge tone="success">Live</Badge> : null}
                {version.restored ? <Badge>Restored</Badge> : null}
              </div>
              <span className="text-xs text-fg-subtle">by {version.author}</span>
              {index > 0 ? (
                <Button
                  size="sm"
                  intent="ghost"
                  className="self-start"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () =>
                      settle(await restoreFactSheetAction({ versionId: version.id, previousId: live?.id ?? null }), "Version restored"),
                    )
                  }
                >
                  Restore
                </Button>
              ) : null}
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
