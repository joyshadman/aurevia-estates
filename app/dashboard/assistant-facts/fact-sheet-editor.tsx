"use client";

import { History, RotateCcw, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { factSheetMax, factSheetPlaceholders } from "@/lib/domain/fact-sheet";
import { formatViewingTime } from "@/lib/domain/viewing-slots";
import type { FactSheetVersion } from "@/lib/server/assistant/fact-sheet";
import { MessageText } from "@/app/assistant/message-text";
import { restoreFactSheet, saveFactSheet } from "./actions";
import { factSheetMessages, type FactSheetMessageReason } from "./messages";

const characters = new Intl.NumberFormat("en-US");

// The fact sheet editor (spec 0006, AC-14). `versions[0]` is the live version;
// every save and restore names it as `previousId`, so a save from an older
// version is refused as `stale` and the agent reloads.
export function FactSheetEditor({ versions }: { versions: FactSheetVersion[] }) {
  const live = versions[0];
  const router = useRouter();
  const [body, setBody] = useState(live.body);
  const [reason, setReason] = useState<FactSheetMessageReason | null>(null);
  const [restoring, setRestoring] = useState<FactSheetVersion | null>(null);
  const [pending, startTransition] = useTransition();

  const trimmed = body.trim();
  const length = trimmed.length;
  const tooLong = length > factSheetMax;
  const dirty = trimmed !== live.body.trim();
  const placeholders = factSheetPlaceholders(body);

  const run = (call: () => ReturnType<typeof saveFactSheet>, success: string) =>
    startTransition(async () => {
      const result = await call();
      if (!result.ok) {
        setReason(result.reason);
        return;
      }
      setReason(null);
      toast({ tone: "success", title: success, body: "The assistant uses it from the next reply." });
      // The page remounts this editor for the new live version.
      router.refresh();
    });

  const save = () => {
    if (length === 0 || tooLong) {
      setReason("invalid");
      return;
    }
    run(() => saveFactSheet({ body: trimmed, previousId: live.id }), "Fact sheet saved");
  };

  const restore = () => {
    const version = restoring;
    setRestoring(null);
    if (!version) return;
    run(() => restoreFactSheet({ versionId: version.id, previousId: live.id }), "Version restored");
  };

  return (
    <div className="flex flex-col gap-8">
      {reason === "stale" || reason === "not_found" ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-warning-subtle px-4 py-3 text-sm text-warning-subtle-fg">
          <p>{factSheetMessages[reason]}</p>
          <Button type="button" intent="secondary" size="sm" onClick={() => window.location.reload()}>
            <RotateCw aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
            Reload
          </Button>
        </div>
      ) : reason ? (
        <p role="alert" className="rounded-xl bg-danger-subtle px-4 py-3 text-sm text-danger-subtle-fg">
          {factSheetMessages[reason]}
        </p>
      ) : null}

      <div className="grid gap-8 xl:grid-cols-2">
        <Panel title="Fact sheet" description={`Live since ${formatViewingTime(live.createdAt)}, by ${authorLabel(live)}.`}>
          <Field
            id="fact-sheet-body"
            label="Markdown"
            hint={`${characters.format(length)} of ${characters.format(factSheetMax)} characters. Use # for headings, - for lists, and **bold**.`}
            error={length === 0 ? "Write at least one line." : `Shorten it by ${characters.format(length - factSheetMax)} characters.`}
            showError={length === 0 || tooLong}
          >
            <Textarea rows={20} value={body} onChange={(event) => setBody(event.target.value)} disabled={pending} className="font-mono" />
          </Field>
          {placeholders.length > 0 ? (
            <p className="rounded-xl bg-surface-sunken px-4 py-3 text-sm text-fg-muted">
              Still to fill in: {placeholders.join(", ")}. Until you do, the assistant says an advisor will confirm.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={save} loading={pending} disabled={!dirty || pending}>
              Save
            </Button>
            <Button type="button" intent="ghost" onClick={() => setBody(live.body)} disabled={!dirty || pending}>
              Discard changes
            </Button>
          </div>
        </Panel>

        <Panel title="Preview" description="How the text reads. The assistant gets it as written, not as a page.">
          <div className="rounded-2xl border border-line px-5 py-4 text-sm text-fg-muted">
            {trimmed ? <FactSheetPreview text={trimmed} /> : <p className="text-fg-subtle">Nothing to preview yet.</p>}
          </div>
        </Panel>
      </div>

      <Panel title="Versions" description="Every save, newest first. Restoring saves that text again as the newest version.">
        <ol className="flex flex-col divide-y divide-line">
          {versions.map((version, index) => (
            <li key={version.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm font-medium text-fg">{formatViewingTime(version.createdAt)}</p>
                  {index === 0 ? <Badge tone="success">Live</Badge> : null}
                  <p className="text-sm text-fg-muted">
                    {authorLabel(version)}
                    {version.restoredFrom ? ` · restored from ${formatViewingTime(version.restoredFrom)}` : ""}
                  </p>
                </div>
                {index === 0 ? null : (
                  <Button type="button" intent="secondary" size="sm" onClick={() => setRestoring(version)} disabled={pending}>
                    <RotateCcw aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
                    Restore
                  </Button>
                )}
              </div>
              <details className="group text-sm">
                <summary className="flex w-fit cursor-pointer items-center gap-2 text-fg-muted hover:text-fg">
                  <History aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
                  Show text
                </summary>
                <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-surface-sunken px-4 py-3 font-mono text-xs whitespace-pre-wrap text-fg">
                  {version.body}
                </pre>
              </details>
            </li>
          ))}
        </ol>
      </Panel>

      <Dialog
        open={restoring !== null}
        onClose={() => setRestoring(null)}
        title="Restore this version?"
        description={
          restoring
            ? `The text saved ${formatViewingTime(restoring.createdAt)} becomes live for the next reply.${dirty ? " Your unsaved changes are discarded." : ""}`
            : undefined
        }
        footer={
          <>
            <Button type="button" intent="ghost" onClick={() => setRestoring(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={restore}>
              Restore
            </Button>
          </>
        }
      />
    </div>
  );
}

function authorLabel(version: FactSheetVersion) {
  if (version.author) return version.author;
  return version.first ? "the starting version" : "a removed account";
}

const heading = /^(#{1,3})\s+(.*)$/;

// Headings on their own, everything else through the chat's safe renderer
// (paragraphs, `- ` lists, `**bold**`), so the preview never renders HTML.
function FactSheetPreview({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let rest: string[] = [];
  const flush = () => {
    if (rest.join("").trim()) blocks.push(<MessageText key={blocks.length} text={rest.join("\n")} />);
    rest = [];
  };
  for (const line of text.split("\n")) {
    const match = heading.exec(line);
    if (!match) {
      rest.push(line);
      continue;
    }
    flush();
    blocks.push(
      match[1].length === 1 ? (
        <h3 key={blocks.length} className="font-display text-lg text-fg">
          {match[2]}
        </h3>
      ) : (
        <h4 key={blocks.length} className="font-semibold text-fg">
          {match[2]}
        </h4>
      ),
    );
  }
  flush();
  return <div className="flex flex-col gap-3">{blocks}</div>;
}

function Panel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-3xl border border-line bg-surface-raised p-6 shadow-soft sm:p-8">
      <div>
        <h2 className="font-display text-xl text-fg">{title}</h2>
        {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
