"use client";

import { LogOut, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { signInAgain, signOut } from "@/app/(auth)/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { authMessages, codeLength, type AuthReason } from "@/lib/auth/messages";
import { isStrongPassword } from "@/lib/auth/password";
import {
  changePassword,
  linkGoogle,
  requestSetPasswordCode,
  setFirstPassword,
  signOutEverywhere,
  unlinkMethod,
  updateProfile,
} from "./actions";
import type { CountryOption } from "./countries";

function Alert({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-xl bg-danger-subtle px-4 py-3 text-sm text-danger-subtle-fg">
      {message}
    </p>
  );
}

// Reasons that need a newer session: sign in again, then come back here (AC-9, AC-10).
const signInFirst: AuthReason[] = ["mfa_required", "session_not_fresh"];

function ReasonAlert({ reason }: { reason: AuthReason }) {
  const [pending, startTransition] = useTransition();
  if (!signInFirst.includes(reason)) return <Alert message={authMessages[reason]} />;
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-danger-subtle px-4 py-3 text-sm text-danger-subtle-fg">
      <p>{authMessages[reason]}</p>
      <Button
        type="button"
        intent="secondary"
        size="sm"
        disabled={pending}
        onClick={() => startTransition(() => signInAgain({ next: "/account" }))}
      >
        Sign in again
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ProfileForm({
  fullName,
  national,
  countryCode,
  countries,
}: {
  fullName: string;
  national: string;
  countryCode: string;
  countries: CountryOption[];
}) {
  const [error, setError] = useState<AuthReason | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateProfile({
        fullName: String(form.get("fullName") ?? ""),
        phone: String(form.get("phone") ?? ""),
        countryCode: String(form.get("countryCode") ?? "BD"),
      });
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      setError(null);
      setSubmitted(false);
      toast({ tone: "success", title: "Profile saved" });
    });
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <Field
        id="account-name"
        label="Full name"
        error={error === "invalid_name" ? authMessages.invalid_name : undefined}
        showError={submitted}
      >
        <Input name="fullName" defaultValue={fullName} autoComplete="name" maxLength={80} required disabled={pending} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <Field id="account-country" label="Country">
          <Select name="countryCode" defaultValue={countryCode} autoComplete="country" disabled={pending}>
            {countries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          id="account-phone"
          label="Phone"
          hint="Agents use it to confirm your viewings. Leave it empty to remove it."
          error={error === "invalid_phone" ? authMessages.invalid_phone : undefined}
          showError={submitted}
        >
          <Input name="phone" type="tel" defaultValue={national} autoComplete="tel-national" disabled={pending} />
        </Field>
      </div>
      <div>
        <Button type="submit" loading={pending}>
          Save profile
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------

// With a password: the current one and a new one. Without: a code to the
// account's email, then the first password. Either ends every other session (AC-10).
export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  return hasPassword ? <ChangePasswordForm /> : <FirstPasswordForm />;
}

function ChangePasswordForm() {
  const [error, setError] = useState<AuthReason | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get("currentPassword") ?? "");
    const password = String(data.get("password") ?? "");
    if (!isStrongPassword(password)) {
      setError("weak_password");
      return;
    }
    startTransition(async () => {
      const result = await changePassword({ currentPassword, password });
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      setError(null);
      setSubmitted(false);
      form.reset();
      toast({ tone: "success", title: "Password saved" });
    });
  };

  const formReason = error && error !== "weak_password" && error !== "invalid_credentials" ? error : null;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {formReason ? <ReasonAlert reason={formReason} /> : null}
      <Field
        id="account-current-password"
        label="Current password"
        // spec 0008, *Error messages*: on this form `invalid_credentials` names the current password.
        error={error === "invalid_credentials" ? "Your current password is wrong." : undefined}
        showError={submitted}
      >
        <Input name="currentPassword" type="password" autoComplete="current-password" required disabled={pending} />
      </Field>
      <Field
        id="account-password"
        label="New password"
        hint="At least 8 characters, with a letter and a number."
        error={error === "weak_password" ? authMessages.weak_password : undefined}
        showError={submitted}
      >
        <Input name="password" type="password" autoComplete="new-password" required disabled={pending} />
      </Field>
      <div>
        <Button type="submit" loading={pending}>
          Save password
        </Button>
      </div>
    </form>
  );
}

function FirstPasswordForm() {
  const [stage, setStage] = useState<"idle" | "code">("idle");
  const [error, setError] = useState<AuthReason | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const sendCode = () =>
    startTransition(async () => {
      const result = await requestSetPasswordCode();
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      setError(null);
      setStage("code");
      setCooldown(result.cooldownSeconds);
    });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const code = String(form.get("code") ?? "").replace(/\s/g, "");
    if (!isStrongPassword(password)) {
      setError("weak_password");
      return;
    }
    startTransition(async () => {
      const result = await setFirstPassword({ code, password });
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      toast({ tone: "success", title: "Password saved" });
      // The page now offers changing it, and 2FA can be turned on.
      router.refresh();
    });
  };

  if (stage === "idle") {
    return (
      <div className="flex flex-col gap-4">
        {error ? <ReasonAlert reason={error} /> : null}
        <p className="text-sm text-fg-muted">We&apos;ll email you a code to confirm it&apos;s you.</p>
        <div>
          <Button type="button" intent="secondary" loading={pending} onClick={sendCode}>
            <Mail aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
            Email me a code
          </Button>
        </div>
      </div>
    );
  }

  const fieldError = (reason: AuthReason) => (error === reason ? authMessages[reason] : undefined);
  const formReason = error && error !== "weak_password" && error !== "otp_invalid" ? error : null;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {formReason ? <ReasonAlert reason={formReason} /> : null}
      <Field id="account-code" label="Code from the email" error={fieldError("otp_invalid")} showError={submitted}>
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
      <Field
        id="account-password"
        label="Password"
        hint="At least 8 characters, with a letter and a number."
        error={fieldError("weak_password")}
        showError={submitted}
      >
        <Input name="password" type="password" autoComplete="new-password" required disabled={pending} />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending}>
          Save password
        </Button>
        <Button type="button" intent="ghost" size="sm" disabled={cooldown > 0 || pending} onClick={sendCode}>
          {cooldown > 0 ? `Send a new code in ${cooldown}s` : "Send a new code"}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------

type Method = { id: string; provider: string };

const providerName = (provider: string) =>
  provider === "google" ? "Google" : provider === "credential" ? "Email and password" : provider;

export function LinkedMethods({ methods, email, error: initialError }: { methods: Method[]; email: string; error?: string }) {
  const [error, setError] = useState<AuthReason | null>(null);
  const [pending, startTransition] = useTransition();
  const [removed, setRemoved] = useState<string[]>([]);
  const visible = methods.filter((method) => !removed.includes(method.id));
  const hasGoogle = visible.some((method) => method.provider === "google");

  const unlink = (accountId: string) =>
    startTransition(async () => {
      const result = await unlinkMethod({ accountId });
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      setError(null);
      setRemoved((ids) => [...ids, accountId]);
      toast({ tone: "success", title: "Sign in method removed" });
    });

  const link = () =>
    startTransition(async () => {
      const result = await linkGoogle();
      if (!result.ok) setError(result.reason);
    });

  return (
    <div className="flex flex-col gap-4">
      {error ? <ReasonAlert reason={error} /> : initialError ? <Alert message={initialError} /> : null}
      <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line">
        <li className="px-4 py-3">
          <span className="block text-sm font-medium text-fg">Email code</span>
          <span className="block text-xs text-fg-muted">{email}, always on</span>
        </li>
        {visible.map((method) => (
          <li key={method.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <span className="block text-sm font-medium text-fg">{providerName(method.provider)}</span>
            {visible.length > 1 ? (
              <Button
                type="button"
                intent="ghost"
                size="sm"
                disabled={pending}
                onClick={() => unlink(method.id)}
                aria-label={`Unlink ${providerName(method.provider)}`}
              >
                Unlink
              </Button>
            ) : (
              <Badge>Only method</Badge>
            )}
          </li>
        ))}
      </ul>
      {hasGoogle ? null : (
        <div>
          <Button type="button" intent="secondary" loading={pending} onClick={link}>
            Link Google
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function SignOutPanel() {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap gap-3">
      <Button type="button" intent="secondary" disabled={pending} onClick={() => startTransition(() => signOut())}>
        <LogOut aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
        Sign out
      </Button>
      <Button type="button" intent="ghost" disabled={pending} onClick={() => setConfirming(true)}>
        Sign out everywhere
      </Button>
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Sign out everywhere?"
        description="This ends every session on every device, including this one."
        footer={
          <ConfirmFooter
            pending={pending}
            onCancel={() => setConfirming(false)}
            onConfirm={() => startTransition(() => signOutEverywhere())}
          >
            Sign out everywhere
          </ConfirmFooter>
        }
      />
    </div>
  );
}

function ConfirmFooter({
  pending,
  onCancel,
  onConfirm,
  children,
}: {
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <Button type="button" intent="ghost" onClick={onCancel} disabled={pending}>
        Cancel
      </Button>
      <Button type="button" intent="danger" loading={pending} onClick={onConfirm}>
        {children}
      </Button>
    </>
  );
}
