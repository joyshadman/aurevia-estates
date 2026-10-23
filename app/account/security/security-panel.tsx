"use client";

import { Copy, Download, ShieldAlert, ShieldCheck, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { signInAgain } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { authMessages, codeLength, type AuthReason } from "@/lib/auth/messages";
import { confirmTwoFactor, disableTwoFactor, enableTwoFactor, regenerateBackupCodes } from "../actions";

type Enrollment = { qrCode: string; secret: string; backupCodes: string[] };

// What the panel shows: the page state, the scan step while turning 2FA on,
// or a fresh set of backup codes (shown once).
type Stage = { name: "idle" } | { name: "scan"; enrollment: Enrollment } | { name: "codes"; codes: string[] };

const securityPath = "/account/security";

function Notice({ tone, children }: { tone: "warning" | "danger"; children: ReactNode }) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={
        tone === "danger"
          ? "flex flex-wrap items-center justify-between gap-3 rounded-xl bg-danger-subtle px-4 py-3 text-sm text-danger-subtle-fg"
          : "flex items-start gap-3 rounded-xl bg-warning-subtle px-4 py-3 text-sm text-warning-subtle-fg"
      }
    >
      {children}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-line bg-surface-raised p-6 shadow-soft sm:p-8">
      <h2 className="font-display text-xl text-fg">{title}</h2>
      {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

const field = (form: HTMLFormElement, name: string) => String(new FormData(form).get(name) ?? "");

// Two step verification (spec 0008, AC-9): one authenticator plus backup codes.
export function SecurityPanel({
  isAgent,
  setupRequired,
  next,
  enabled,
  hasPassword,
  canEnroll,
  fresh,
  backupCodesLeft,
}: {
  isAgent: boolean;
  setupRequired: boolean;
  next?: string;
  enabled: boolean;
  hasPassword: boolean;
  // False for an agent signed in more than 15 minutes ago.
  canEnroll: boolean;
  // An authenticator code within 12 hours, needed to change anything once it is on.
  fresh: boolean;
  backupCodesLeft: number;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ name: "idle" });
  const [error, setError] = useState<AuthReason | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();

  const fail = (reason: AuthReason) => {
    setError(reason);
    setSubmitted(true);
  };
  const clear = () => {
    setError(null);
    setSubmitted(false);
  };

  // An agent signs in again with no `next`: their default landing goes through
  // the agent gate, which brings them back here with `setup=required` (AC-8).
  const reauth = () => startTransition(() => signInAgain({ next: isAgent ? undefined : securityPath }));

  const onEnable = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const password = field(event.currentTarget, "password");
    startTransition(async () => {
      const result = await enableTwoFactor({ password });
      if (!result.ok) return fail(result.reason);
      clear();
      setStage({ name: "scan", enrollment: result });
    });
  };

  const onConfirm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (stage.name !== "scan") return;
    const code = field(event.currentTarget, "code").replace(/\s/g, "");
    const { backupCodes } = stage.enrollment;
    startTransition(async () => {
      const result = await confirmTwoFactor({ code });
      if (!result.ok) return fail(result.reason);
      clear();
      toast({ tone: "success", title: "Two step verification is on" });
      setStage({ name: "codes", codes: backupCodes });
    });
  };

  const onRegenerate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const password = field(event.currentTarget, "password");
    startTransition(async () => {
      const result = await regenerateBackupCodes({ password });
      if (!result.ok) return fail(result.reason);
      clear();
      setStage({ name: "codes", codes: result.backupCodes });
    });
  };

  const onDisable = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const password = field(event.currentTarget, "password");
    startTransition(async () => {
      const result = await disableTwoFactor({ password });
      if (!result.ok) return fail(result.reason);
      clear();
      toast({ tone: "success", title: "Two step verification is off" });
      router.refresh();
    });
  };

  // After the codes are saved: on to `next` (already checked by the server), else stay.
  const done = () => {
    setStage({ name: "idle" });
    if (next) router.push(next);
    else router.refresh();
  };

  const passwordError = error === "invalid_credentials" ? authMessages.invalid_credentials : undefined;
  const codeError = error === "otp_invalid" ? authMessages.otp_invalid : undefined;
  const formError = error && !passwordError && !codeError ? error : null;
  const needsSignIn = formError === "mfa_required" || formError === "reauth_required";

  return (
    <div className="mt-10 flex flex-col gap-8">
      {setupRequired ? (
        <Notice tone="warning">
          <ShieldAlert aria-hidden="true" strokeWidth={1.5} className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Agent pages need two step verification. Turn it on below to open your dashboard.</p>
        </Notice>
      ) : null}
      {formError ? (
        <Notice tone="danger">
          <p>{authMessages[formError]}</p>
          {needsSignIn ? (
            <Button type="button" intent="secondary" size="sm" disabled={pending} onClick={reauth}>
              Sign in again
            </Button>
          ) : null}
        </Notice>
      ) : null}

      {stage.name === "codes" ? (
        <BackupCodes codes={stage.codes} onDone={done} />
      ) : stage.name === "scan" ? (
        <Section title="Scan the code" description="Use an app like Google Authenticator, Microsoft Authenticator, or 1Password.">
          <form onSubmit={onConfirm} noValidate className="flex flex-col gap-6">
            <div className="flex flex-col items-start gap-4 sm:flex-row">
              {/* A generated PNG data URL, which next/image can't optimize. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={stage.enrollment.qrCode}
                alt="QR code to scan with your authenticator app"
                width={176}
                height={176}
                className="rounded-xl border border-line bg-surface-raised p-2"
              />
              <div className="flex flex-col gap-2 text-sm text-fg-muted">
                <p className="flex items-center gap-2">
                  <Smartphone aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
                  Scan the code, or type this key into the app:
                </p>
                <code className="rounded-lg bg-surface-sunken px-3 py-2 font-mono text-xs break-all text-fg">
                  {stage.enrollment.secret}
                </code>
              </div>
            </div>
            <Field id="enroll-code" label="6 digit code from the app" error={codeError} showError={submitted}>
              <Input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={codeLength}
                required
                disabled={pending}
                className="font-mono tracking-[.4em]"
              />
            </Field>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" loading={pending}>
                Turn on
              </Button>
              <Button type="button" intent="ghost" disabled={pending} onClick={() => (clear(), setStage({ name: "idle" }))}>
                Cancel
              </Button>
            </div>
          </form>
        </Section>
      ) : enabled ? (
        <>
          <Section title="Status">
            <p className="flex items-center gap-2 text-sm text-fg">
              <ShieldCheck aria-hidden="true" strokeWidth={1.5} className="h-4 w-4 text-accent" />
              On. Signing in with your password also asks for a code from your app.
            </p>
          </Section>
          <Section
            title="Backup codes"
            description={`${backupCodesLeft} of 10 left. Each one works once if you lose your phone. New codes replace the old ones.`}
          >
            {fresh ? (
              <PasswordForm id="regenerate" submitLabel="Get new codes" error={passwordError} showError={submitted} pending={pending} onSubmit={onRegenerate} />
            ) : (
              <SignInFirst pending={pending} onClick={reauth} />
            )}
          </Section>
          <Section title="Turn off">
            {isAgent ? (
              <p className="text-sm text-fg-muted">{authMessages.agent_needs_2fa}</p>
            ) : fresh ? (
              <PasswordForm id="disable" submitLabel="Turn off" danger error={passwordError} showError={submitted} pending={pending} onSubmit={onDisable} />
            ) : (
              <SignInFirst pending={pending} onClick={reauth} />
            )}
          </Section>
        </>
      ) : !hasPassword ? (
        <Section title="Set a password first" description="Two step verification protects password sign in, so it needs a password.">
          <p className="text-sm text-fg-muted">
            {isAgent
              ? "Set a password on your account page, then come straight back: agents turn this on within 15 minutes of signing in."
              : "Set one on your account page, then come back here."}
          </p>
          <div className="mt-6">
            <Button href={`/account#password`} intent="secondary">
              Set a password
            </Button>
          </div>
        </Section>
      ) : !canEnroll ? (
        <Section title="Turn on two step verification">
          <Notice tone="warning">
            <ShieldAlert aria-hidden="true" strokeWidth={1.5} className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{authMessages.reauth_required}</p>
          </Notice>
          <div className="mt-6">
            <Button type="button" intent="secondary" disabled={pending} onClick={reauth}>
              Sign in again
            </Button>
          </div>
        </Section>
      ) : (
        <Section title="Turn on two step verification" description="Enter your password to start. Then scan a QR code with your authenticator app.">
          <PasswordForm id="enable" submitLabel="Continue" error={passwordError} showError={submitted} pending={pending} onSubmit={onEnable} />
        </Section>
      )}
    </div>
  );
}

function PasswordForm({
  id,
  submitLabel,
  danger,
  error,
  showError,
  pending,
  onSubmit,
}: {
  id: string;
  submitLabel: string;
  danger?: boolean;
  error?: string;
  showError: boolean;
  pending: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <Field id={`${id}-password`} label="Your password" error={error} showError={showError}>
        <Input name="password" type="password" autoComplete="current-password" required disabled={pending} />
      </Field>
      <div>
        <Button type="submit" intent={danger ? "danger" : "primary"} loading={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function SignInFirst({ pending, onClick }: { pending: boolean; onClick: () => void }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <p className="text-sm text-fg-muted">{authMessages.mfa_required}</p>
      <Button type="button" intent="secondary" disabled={pending} onClick={onClick}>
        Sign in again
      </Button>
    </div>
  );
}

// Shown once, right after turning 2FA on or regenerating (AC-9).
function BackupCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const text = codes.join("\n");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ tone: "success", title: "Backup codes copied" });
    } catch {
      toast({ tone: "danger", title: "Couldn't copy. Select the codes and copy them instead." });
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([`Aurevia Estates backup codes\n\n${text}\n`], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "aurevia-backup-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Section
      title="Save your backup codes"
      description="Each code works once, if you lose your phone. This is the only time you'll see them, so keep them somewhere safe."
    >
      <ul className="grid grid-cols-2 gap-2 rounded-2xl bg-surface-sunken p-4 font-mono text-sm text-fg sm:grid-cols-5">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button type="button" intent="secondary" onClick={copy}>
          <Copy aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
          Copy
        </Button>
        <Button type="button" intent="secondary" onClick={download}>
          <Download aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
          Download
        </Button>
        <Button type="button" onClick={onDone}>
          I&apos;ve saved them
        </Button>
      </div>
    </Section>
  );
}
