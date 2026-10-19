"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authMessage } from "@/lib/domain/auth-messages";
import {
  requestPasswordResetAction,
  resendSignupCodeAction,
  signInWithPasswordAction,
  signUpWithPasswordAction,
  verifyEmailCodeAction,
  type SignInState,
} from "../actions";

// The sign in steps (spec 0004): password sign in or create account, forgot
// password, and the 6 digit code that confirms a new account or a reset.
// Email code sign in and Google join here once their keys exist.

type Mode = "signin" | "signup" | "forgot";

function Notice({ state, error }: { state: SignInState; error: string | null }) {
  const message = state && !state.ok ? authMessage(state.reason) : authMessage(error);
  return message ? (
    <p role="alert" className="rounded-xl bg-danger-subtle px-4 py-3 text-sm text-danger-subtle-fg">
      {message}
    </p>
  ) : null;
}

export function SignInForm({ next, error }: { next: string; error: string | null }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [signIn, signInAction, signingIn] = useActionState<SignInState, FormData>(signInWithPasswordAction, null);
  const [signUp, signUpAction, signingUp] = useActionState<SignInState, FormData>(signUpWithPasswordAction, null);
  const [reset, resetAction, resetting] = useActionState<SignInState, FormData>(requestPasswordResetAction, null);

  const verify = [signUp, reset].find((s): s is Extract<SignInState, { step: "verify" }> => s?.ok === true) ?? null;
  if (verify && (mode === "signup" || mode === "forgot")) {
    return <CodeStep email={verify.email} purpose={verify.purpose} next={next} initialCooldown={verify.cooldownSeconds} />;
  }

  const state = mode === "signin" ? signIn : mode === "signup" ? signUp : reset;
  const notConfirmed = mode === "signin" && signIn?.ok === false && signIn.reason === "email_not_confirmed";

  return (
    <div className="flex w-full max-w-md flex-col gap-6 rounded-2xl border border-line bg-surface-raised p-8">
      <div>
        <h1 className="font-display text-3xl text-fg">{mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Sign in"}</h1>
        <p className="mt-1 text-sm text-fg-muted">
          {mode === "forgot" ? "We'll email you a code to set a new password." : "Chat with the Aurevia Assistant and book viewings."}
        </p>
      </div>
      <Notice state={state} error={state ? null : error} />

      <form action={mode === "signin" ? signInAction : mode === "signup" ? signUpAction : resetAction} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
        <Field id="email" label="Email">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        {mode !== "forgot" ? (
          <Field id="password" label="Password" hint={mode === "signup" ? "At least 8 characters with a letter and a number." : undefined}>
            <Input name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={8} />
          </Field>
        ) : null}
        <Button type="submit" loading={signingIn || signingUp || resetting}>
          {mode === "signup" ? "Create account" : mode === "forgot" ? "Send code" : "Sign in"}
        </Button>
      </form>

      {notConfirmed ? <ResendLink /> : null}

      <div className="flex flex-wrap justify-between gap-2 text-sm">
        {mode === "signin" ? (
          <>
            <button type="button" className="text-accent hover:underline" onClick={() => setMode("signup")}>
              Create an account
            </button>
            <button type="button" className="text-accent hover:underline" onClick={() => setMode("forgot")}>
              Forgot password?
            </button>
          </>
        ) : (
          <button type="button" className="text-accent hover:underline" onClick={() => setMode("signin")}>
            Back to sign in
          </button>
        )}
      </div>
    </div>
  );
}

// "Confirm your email first" offers a new code (AC-3).
function ResendLink() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-surface-sunken p-4">
      <Field id="resend-email" label="Send a new confirmation code to">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Button
        size="sm"
        intent="secondary"
        loading={pending}
        disabled={!email}
        onClick={() =>
          startTransition(async () => {
            const result = await resendSignupCodeAction(email);
            setSent(result.ok ? "Check your email for a new code." : authMessage(result.reason));
          })
        }
      >
        Send code
      </Button>
      {sent ? <p className="text-sm text-fg-muted">{sent}</p> : null}
    </div>
  );
}

// The 6 digit code step, with the resend countdown (AC-2, AC-3, AC-7).
function CodeStep({ email, purpose, next, initialCooldown }: { email: string; purpose: "signup" | "recovery"; next: string; initialCooldown: number }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(verifyEmailCodeAction, null);
  const [cooldown, setCooldown] = useState(initialCooldown);
  const [resending, startResend] = useTransition();
  const [resent, setResent] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  return (
    <div className="flex w-full max-w-md flex-col gap-6 rounded-2xl border border-line bg-surface-raised p-8">
      <div>
        <h1 className="font-display text-3xl text-fg">Check your email</h1>
        <p className="mt-1 text-sm text-fg-muted">
          If {email} can use this, we sent it a 6 digit code. Enter it below, or open the link in the email.
        </p>
      </div>
      <Notice state={state} error={null} />
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="purpose" value={purpose} />
        <input type="hidden" name="next" value={next} />
        <Field id="token" label="Code">
          <Input name="token" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required className="text-lg tracking-[0.4em]" />
        </Field>
        <Button type="submit" loading={pending}>
          Continue
        </Button>
      </form>
      {purpose === "signup" ? (
        <div className="flex flex-col gap-1 text-sm">
          <button
            type="button"
            disabled={cooldown > 0 || resending}
            className="self-start text-accent hover:underline disabled:text-fg-subtle disabled:no-underline"
            onClick={() =>
              startResend(async () => {
                const result = await resendSignupCodeAction(email);
                setCooldown(result.ok ? result.cooldownSeconds : (result.cooldownSeconds ?? 60));
                setResent(result.ok ? "We sent a new code." : authMessage(result.reason));
              })
            }
          >
            {cooldown > 0 ? `Send a new code in ${cooldown}s` : "Send a new code"}
          </button>
          {resent ? <span className="text-fg-muted">{resent}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
