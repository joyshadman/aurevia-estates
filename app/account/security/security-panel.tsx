"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { authMessage } from "@/lib/domain/auth-messages";
import { enrollFactorAction, removeFactorAction, verifyFactorAction } from "../actions";

type Factor = { id: string; name: string; createdAt: string };

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" });

export function SecurityPanel({ isAgent, setupRequired, next, factors }: { isAgent: boolean; setupRequired: boolean; next: string; factors: Factor[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(factors.length === 0 ? "My phone" : "Backup phone");
  const [enrolling, setEnrolling] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const fail = (reason: string) => {
    if (reason === "mfa_required") {
      router.push(`/mfa?next=${encodeURIComponent("/account/security")}`);
      return;
    }
    setMessage(authMessage(reason));
  };

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl text-fg">Authenticator app</h1>
        <p className="mt-1 text-sm text-fg-muted">
          A code from an app like Google Authenticator or 1Password, on top of your password or email code.
        </p>
      </div>
      {setupRequired ? (
        <p role="status" className="rounded-xl bg-warning-subtle px-4 py-3 text-sm text-warning-subtle-fg">
          Agent pages need an authenticator. Set one up below to continue.
        </p>
      ) : null}
      {isAgent && factors.length === 1 ? (
        <p role="status" className="rounded-xl bg-accent-subtle px-4 py-3 text-sm text-accent-subtle-fg">
          Add a backup authenticator (another phone or a password manager), so losing one phone doesn&apos;t lock you out.
        </p>
      ) : null}
      {message ? (
        <p role="alert" className="rounded-xl bg-danger-subtle px-4 py-3 text-sm text-danger-subtle-fg">
          {message}
        </p>
      ) : null}

      {factors.length > 0 ? (
        <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface-raised px-6">
          {factors.map((factor) => (
            <li key={factor.id} className="flex items-center justify-between gap-3 py-4 text-sm">
              <span className="text-fg">
                {factor.name}
                <span className="block text-xs text-fg-subtle">Added {day.format(new Date(factor.createdAt))}</span>
              </span>
              <Button
                size="sm"
                intent="ghost"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await removeFactorAction({ factorId: factor.id });
                    if (!result.ok) return fail(result.reason);
                    toast({ tone: "success", title: "Authenticator removed" });
                    router.refresh();
                  })
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <section aria-label="Add an authenticator" className="flex flex-col gap-4 rounded-2xl border border-line bg-surface-raised p-6">
        <h2 className="font-display text-xl text-fg">{factors.length === 0 ? "Set up an authenticator" : "Add another authenticator"}</h2>
        {enrolling ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const result = await verifyFactorAction({ factorId: enrolling.factorId, code });
                if (!result.ok) return fail(result.reason);
                toast({ tone: "success", title: "Authenticator added" });
                setEnrolling(null);
                setCode("");
                setMessage(null);
                if (next) router.push(next);
                else router.refresh();
              });
            }}
          >
            <p className="text-sm text-fg-muted">Scan this code with your authenticator app, then enter the 6 digit code it shows.</p>
            {/* Supabase returns the QR code as an SVG data URL. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enrolling.qrCode} alt="QR code for your authenticator app" width={192} height={192} className="rounded-xl bg-[white] p-2" />
            <p className="text-xs text-fg-subtle">
              Can&apos;t scan? Enter this key: <code className="break-all text-fg">{enrolling.secret}</code>
            </p>
            <Field id="factor-code" label="Code">
              <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
            <Button type="submit" loading={pending} className="self-end">
              Confirm
            </Button>
          </form>
        ) : (
          <form
            className="flex items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const result = await enrollFactorAction({ friendlyName: name });
                if (!result.ok) return fail(result.reason);
                setMessage(null);
                setEnrolling(result);
              });
            }}
          >
            <Field id="factor-name" label="Name it" className="flex-1">
              <Input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Button type="submit" loading={pending}>
              Start
            </Button>
          </form>
        )}
      </section>
    </div>
  );
}
