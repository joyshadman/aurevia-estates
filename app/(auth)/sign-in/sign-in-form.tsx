"use client";

import { ArrowLeft, KeyRound, Mail } from "lucide-react";
import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { authMessages, codeLength, type AuthReason } from "@/lib/auth/messages";
import { isStrongPassword } from "@/lib/auth/password";
import { useInvisibleCaptcha } from "../captcha";
import { FormAlert } from "../form-alert";
import {
  requestEmailCode,
  requestPasswordReset,
  resendSignupCode,
  setNewPassword,
  signInWithPassword,
  signUpWithPassword,
  startGoogle,
  verifyEmailCode,
  verifyTwoFactor,
} from "../actions";

type Method = "code" | "password";
type Purpose = "signin" | "signup" | "recovery";
type TwoFactorKind = "totp" | "backup";

type Step =
  | { name: "start" }
  | { name: "forgot" }
  | { name: "code"; email: string; purpose: Purpose }
  | { name: "new-password"; email: string; code: string }
  | { name: "2fa" };

// Reasons that end the authenticator step: the password is needed again (AC-9).
const twoFactorEnded: AuthReason[] = ["too_many_attempts", "two_factor_expired"];

function useCountdown() {
  const [secondsLeft, setSecondsLeft] = useState(0);
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);
  return [secondsLeft, setSecondsLeft] as const;
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

const field = (form: HTMLFormElement, name: string) => String(new FormData(form).get(name) ?? "");

// `/sign-in` (spec 0008, AC-1): Google, an email code, or a password, plus
// forgot password. Every email, password, and code request carries a fresh
// invisible hCaptcha token (AC-4); Google does not. An agent sent back here to
// sign in again starts on the password method (AC-8). The authenticator step
// opens when the server found Better Auth's 2FA cookie (`initialStep`).
export function SignInForm({
  next,
  initialError,
  initialMethod = "code",
  initialStep,
}: {
  next?: string;
  initialError: AuthReason | null;
  initialMethod?: Method;
  initialStep?: "2fa";
}) {
  const [step, setStep] = useState<Step>(initialStep === "2fa" ? { name: "2fa" } : { name: "start" });
  const [method, setMethod] = useState<Method>(initialMethod);
  const [twoFactorKind, setTwoFactorKind] = useState<TwoFactorKind>("totp");
  const [signingUp, setSigningUp] = useState(false);
  const [error, setError] = useState<AuthReason | null>(initialError);
  const [submitted, setSubmitted] = useState(false);
  // The email typed on the password form, for the "Send code" action (AC-3).
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [cooldown, setCooldown] = useCountdown();
  const codeRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const captcha = useInvisibleCaptcha();

  useEffect(() => {
    if (step.name === "code" || step.name === "2fa") codeRef.current?.focus();
    if (step.name === "new-password") passwordRef.current?.focus();
  }, [step]);

  const go = (nextStep: Step) => {
    setStep(nextStep);
    setError(null);
    setSubmitted(false);
    setUnconfirmedEmail(null);
  };

  // Runs a captcha guarded request; `run` gets the token and returns the result.
  const guarded = <T,>(run: (token: string) => Promise<T>, onResult: (result: T) => void) =>
    startTransition(async () => {
      const token = await captcha.token();
      if (!token) {
        setError("captcha_failed");
        return;
      }
      onResult(await run(token));
    });

  // Sends (or sends again) the code for a purpose, then shows the code step.
  const sendCode = (email: string, purpose: Purpose) =>
    guarded(
      (token) =>
        purpose === "signin"
          ? requestEmailCode({ email, captchaToken: token, next })
          : purpose === "signup"
            ? resendSignupCode({ email, captchaToken: token, next })
            : requestPasswordReset({ email, captchaToken: token }),
      (result) => {
        if (!result.ok) {
          setError(result.reason);
          return;
        }
        go({ name: "code", email: email.trim().toLowerCase(), purpose });
        setCooldown(result.cooldownSeconds);
      },
    );

  const onCodeEmailSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    sendCode(field(event.currentTarget, "email"), "signin");
  };

  const onPasswordSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    const email = field(event.currentTarget, "email");
    const password = field(event.currentTarget, "password");
    if (signingUp && !isStrongPassword(password)) {
      setError("weak_password");
      return;
    }
    if (signingUp) {
      guarded(
        (token) => signUpWithPassword({ email, password, captchaToken: token, next }),
        (result) => {
          if (!result.ok) {
            setError(result.reason);
            return;
          }
          // AC-3: no session yet; confirm the email with the code first.
          go({ name: "code", email: email.trim().toLowerCase(), purpose: "signup" });
          setCooldown(60);
        },
      );
      return;
    }
    // Success redirects, so only a failure comes back here.
    guarded(
      (token) => signInWithPassword({ email, password, captchaToken: token, next }),
      (result) => {
        if (result.ok) return;
        setError(result.reason);
        setUnconfirmedEmail(result.reason === "email_not_confirmed" ? email.trim().toLowerCase() : null);
      },
    );
  };

  const onForgotSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    sendCode(field(event.currentTarget, "email"), "recovery");
  };

  const onCodeSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step.name !== "code") return;
    setSubmitted(true);
    const code = field(event.currentTarget, "code").replace(/\s/g, "");
    // A reset code opens "Set a new password"; the code is checked when it is saved (AC-7).
    if (step.purpose === "recovery") {
      if (!new RegExp(String.raw`^\d{${codeLength}}$`).test(code)) {
        setError("otp_invalid");
        return;
      }
      go({ name: "new-password", email: step.email, code });
      return;
    }
    const purpose = step.purpose;
    guarded(
      (captchaToken) => verifyEmailCode({ email: step.email, code, purpose, captchaToken, next }),
      (result) => {
        if (!result.ok) setError(result.reason);
      },
    );
  };

  const onNewPasswordSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step.name !== "new-password") return;
    setSubmitted(true);
    const password = field(event.currentTarget, "password");
    if (!isStrongPassword(password)) {
      setError("weak_password");
      return;
    }
    const { email, code } = step;
    guarded(
      (captchaToken) => setNewPassword({ email, code, password, captchaToken, next }),
      (result) => {
        if (result.ok) return;
        if (result.reason === "otp_invalid") {
          // Back to the code, with the reason, so a mistyped code can be fixed.
          go({ name: "code", email, purpose: "recovery" });
          setSubmitted(true);
        }
        setError(result.reason);
      },
    );
  };

  // Success redirects. A locked or expired step goes back to the password, and
  // the address bar drops `?step=2fa` so a reload doesn't ask for a code again.
  const onTwoFactorSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    const code = field(event.currentTarget, "code").replace(/\s/g, "");
    startTransition(async () => {
      const result = await verifyTwoFactor({ code, kind: twoFactorKind, next });
      if (result.ok) return;
      if (twoFactorEnded.includes(result.reason)) {
        const url = new URL(window.location.href);
        url.searchParams.delete("step");
        window.history.replaceState(null, "", url);
        go({ name: "start" });
        setMethod("password");
      }
      setError(result.reason);
    });
  };

  const onGoogle = () =>
    startTransition(async () => {
      const result = await startGoogle({ next });
      if (!result.ok) setError(result.reason);
    });

  // A field shows only its own mistake; anything else is a form level alert.
  const fieldReasons: AuthReason[] =
    step.name === "code" || step.name === "2fa"
      ? ["otp_invalid"]
      : step.name === "new-password" || (method === "password" && step.name === "start")
        ? ["weak_password"]
        : ["invalid_email"];
  const fieldError = error && fieldReasons.includes(error) ? authMessages[error] : undefined;
  const formError = error && !fieldReasons.includes(error) ? authMessages[error] : undefined;

  const alert = formError ? (
    <FormAlert message={formError}>
      {unconfirmedEmail ? (
        <Button
          type="button"
          intent="secondary"
          size="sm"
          disabled={pending}
          onClick={() => sendCode(unconfirmedEmail, "signup")}
        >
          Send code
        </Button>
      ) : null}
    </FormAlert>
  ) : null;

  return (
    <div className="flex flex-col gap-6">
      {step.name === "start"
        ? startStep()
        : step.name === "forgot"
          ? forgotStep()
          : step.name === "code"
            ? codeStep(step.email, step.purpose)
            : step.name === "2fa"
              ? twoFactorStep()
              : newPasswordStep()}
      {captcha.widget}
    </div>
  );

  function startStep() {
    return (
      <>
        <div>
          <h1 className="font-display text-3xl leading-tight text-fg sm:text-4xl">
            {method === "password" && signingUp ? "Create your account" : "Sign in to Aurevia"}
          </h1>
          <p className="mt-3 text-base text-fg-muted">
            {method === "code"
              ? "New here? The same step creates your account. We'll email you a 6 digit code, so there's no password to remember."
              : signingUp
                ? "We'll email you a code to confirm the address before you sign in."
                : "Use the email and password you chose for Aurevia."}
          </p>
        </div>
        {alert}
        <Button type="button" intent="secondary" size="lg" className="w-full" disabled={pending} onClick={onGoogle}>
          Continue with Google
        </Button>
        <div className="flex items-center gap-3 text-xs text-fg-subtle" aria-hidden="true">
          <span className="h-px flex-1 bg-line" />
          or
          <span className="h-px flex-1 bg-line" />
        </div>
        <div role="group" aria-label="Sign in method" className="grid grid-cols-2 gap-1 rounded-full bg-surface-sunken p-1">
          <MethodButton active={method === "code"} onClick={() => (setMethod("code"), setError(null), setSubmitted(false))}>
            <Mail aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
            Email code
          </MethodButton>
          <MethodButton
            active={method === "password"}
            onClick={() => (setMethod("password"), setError(null), setSubmitted(false))}
          >
            <KeyRound aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
            Password
          </MethodButton>
        </div>
        {method === "code" ? codeEmailForm() : passwordForm()}
      </>
    );
  }

  function emailField(id: string) {
    return (
      <Field id={id} label="Email" error={error === "invalid_email" ? fieldError : undefined} showError={submitted}>
        <Input
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder="you@example.com"
          disabled={pending}
        />
      </Field>
    );
  }

  function codeEmailForm() {
    return (
      <form onSubmit={onCodeEmailSubmit} noValidate className="flex flex-col gap-6">
        {emailField("sign-in-email")}
        <Button type="submit" size="lg" loading={pending} className="w-full">
          Email me a code
        </Button>
      </form>
    );
  }

  function passwordForm() {
    return (
      <form onSubmit={onPasswordSubmit} noValidate className="flex flex-col gap-6">
        {emailField("password-email")}
        <Field
          id="password"
          label="Password"
          hint={signingUp ? "At least 8 characters, with a letter and a number." : undefined}
          error={error === "weak_password" ? fieldError : undefined}
          showError={submitted}
        >
          <Input
            name="password"
            type="password"
            autoComplete={signingUp ? "new-password" : "current-password"}
            required
            disabled={pending}
          />
        </Field>
        <Button type="submit" size="lg" loading={pending} className="w-full">
          {signingUp ? "Create account" : "Sign in"}
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <Button
            type="button"
            intent="ghost"
            size="sm"
            onClick={() => (setSigningUp((value) => !value), setError(null), setSubmitted(false))}
          >
            {signingUp ? "I already have an account" : "Create an account"}
          </Button>
          {signingUp ? null : (
            <Button type="button" intent="ghost" size="sm" onClick={() => go({ name: "forgot" })}>
              Forgot password?
            </Button>
          )}
        </div>
      </form>
    );
  }

  function forgotStep() {
    return (
      <form onSubmit={onForgotSubmit} noValidate className="flex flex-col gap-6">
        <div>
          <h1 className="font-display text-3xl leading-tight text-fg sm:text-4xl">Reset your password</h1>
          <p className="mt-3 text-base text-fg-muted">
            Enter your email. If it has an account, we&apos;ll send a code to choose a new password.
          </p>
        </div>
        {alert}
        {emailField("reset-email")}
        <Button type="submit" size="lg" loading={pending} className="w-full">
          Send reset code
        </Button>
        <BackButton onClick={() => go({ name: "start" })}>Back to sign in</BackButton>
      </form>
    );
  }

  function codeStep(email: string, purpose: Purpose) {
    return (
      <form onSubmit={onCodeSubmit} noValidate className="flex flex-col gap-6">
        <div>
          <h1 className="font-display text-3xl leading-tight text-fg sm:text-4xl">
            {purpose === "signup" ? "Confirm your email" : "Check your email"}
          </h1>
          <p className="mt-3 text-base text-fg-muted">
            {purpose === "recovery" ? (
              <>If that email has an account, we&apos;ve sent a code. </>
            ) : (
              <>
                We sent a code to <span className="font-medium text-fg">{email}</span>.{" "}
              </>
            )}
            It works once, for 10 minutes. You can also open the link in that email.
          </p>
        </div>
        {alert}
        <Field id="sign-in-code" label="6 digit code" error={fieldError} showError={submitted}>
          <Input
            ref={codeRef}
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={codeLength}
            required
            disabled={pending}
            className="font-mono text-lg tracking-[.5em]"
          />
        </Field>
        <Button type="submit" size="lg" loading={pending} className="w-full">
          Continue
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <BackButton onClick={() => go({ name: purpose === "recovery" ? "forgot" : "start" })}>
            Use a different email
          </BackButton>
          <Button
            type="button"
            intent="ghost"
            size="sm"
            disabled={cooldown > 0 || pending}
            onClick={() => sendCode(email, purpose)}
          >
            {cooldown > 0 ? (
              <>
                Send a new code in <span aria-hidden="true">{clock(cooldown)}</span>
                <span className="sr-only">{cooldown} seconds</span>
              </>
            ) : (
              "Send a new code"
            )}
          </Button>
        </div>
      </form>
    );
  }

  function twoFactorStep() {
    const backup = twoFactorKind === "backup";
    return (
      <form onSubmit={onTwoFactorSubmit} noValidate className="flex flex-col gap-6">
        <div>
          <h1 className="font-display text-3xl leading-tight text-fg sm:text-4xl">Two step verification</h1>
          <p className="mt-3 text-base text-fg-muted">
            {backup
              ? "Enter one of the backup codes you saved when you turned on two step verification. Each works once."
              : "Enter the 6 digit code from your authenticator app."}
          </p>
        </div>
        {alert}
        <Field
          id="two-factor-code"
          label={backup ? "Backup code" : "6 digit code"}
          error={fieldError}
          showError={submitted}
        >
          <Input
            ref={codeRef}
            name="code"
            inputMode={backup ? "text" : "numeric"}
            autoComplete="one-time-code"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={backup ? 20 : codeLength}
            required
            disabled={pending}
            className="font-mono text-lg tracking-[.3em]"
          />
        </Field>
        <Button type="submit" size="lg" loading={pending} className="w-full">
          Continue
        </Button>
        <Button
          type="button"
          intent="ghost"
          size="sm"
          className="self-start"
          disabled={pending}
          onClick={() => (setTwoFactorKind(backup ? "totp" : "backup"), setError(null), setSubmitted(false))}
        >
          {backup ? "Use your authenticator app" : "Use a backup code"}
        </Button>
      </form>
    );
  }

  function newPasswordStep() {
    return (
      <form onSubmit={onNewPasswordSubmit} noValidate className="flex flex-col gap-6">
        <div>
          <h1 className="font-display text-3xl leading-tight text-fg sm:text-4xl">Set a new password</h1>
          <p className="mt-3 text-base text-fg-muted">
            Saving it signs you out on every other device.
          </p>
        </div>
        {alert}
        <Field
          id="new-password"
          label="New password"
          hint="At least 8 characters, with a letter and a number."
          error={fieldError}
          showError={submitted}
        >
          <Input ref={passwordRef} name="password" type="password" autoComplete="new-password" required disabled={pending} />
        </Field>
        <Button type="submit" size="lg" loading={pending} className="w-full">
          Save and sign in
        </Button>
        <BackButton onClick={() => go({ name: "forgot" })}>Send a new code</BackButton>
      </form>
    );
  }
}

function MethodButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-full text-sm font-medium transition-colors duration-fast",
        active ? "bg-surface-raised text-fg shadow-soft" : "text-fg-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function BackButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Button type="button" intent="ghost" size="sm" onClick={onClick}>
      <ArrowLeft aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
      {children}
    </Button>
  );
}
