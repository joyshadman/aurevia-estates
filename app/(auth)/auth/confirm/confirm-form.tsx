"use client";

import { KeyRound, LinkIcon } from "lucide-react";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authMessages, type AuthReason } from "@/lib/auth/messages";
import { isStrongPassword } from "@/lib/auth/password";
import { routes } from "@/lib/nav";
import { confirmEmailLink, setNewPassword } from "../../actions";
import { useInvisibleCaptcha } from "../../captcha";
import { FormAlert } from "../../form-alert";

type ConfirmFormProps = {
  type: "sign-in" | "verify" | "reset";
  email: string;
  code: string;
  next?: string;
};

// Continue (sign in or confirm), or "Set a new password" for a reset link
// (spec 0008, AC-2, AC-7). Each carries a fresh hCaptcha token (AC-4).
export function ConfirmForm({ type, email, code, next }: ConfirmFormProps) {
  const [error, setError] = useState<AuthReason | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();
  const captcha = useInvisibleCaptcha();

  // The code stays out of the address bar, history, and screenshots once read.
  useEffect(() => {
    window.history.replaceState(null, "", "/auth/confirm");
  }, []);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    const password = type === "reset" ? String(new FormData(event.currentTarget).get("password") ?? "") : "";
    if (type === "reset" && !isStrongPassword(password)) {
      setError("weak_password");
      return;
    }
    startTransition(async () => {
      const captchaToken = await captcha.token();
      if (!captchaToken) {
        setError("captcha_failed");
        return;
      }
      // Success redirects, so only a failure comes back here.
      const result =
        type === "reset"
          ? await setNewPassword({ email, code, password, captchaToken, next })
          : await confirmEmailLink({ email, code, type, captchaToken, next });
      if (!result.ok) setError(result.reason === "otp_invalid" ? "link_invalid" : result.reason);
    });
  };

  const linkDead = error === "link_invalid";
  const fieldError = error === "weak_password" ? authMessages.weak_password : undefined;
  const Icon = type === "reset" ? KeyRound : LinkIcon;

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-accent-subtle text-accent">
          <Icon aria-hidden="true" strokeWidth={1.5} className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-display text-3xl leading-tight text-fg">
            {type === "reset" ? "Set a new password" : type === "verify" ? "Confirm your email" : "Continue signing in"}
          </h1>
          <p className="mt-3 text-base text-fg-muted">
            {type === "reset" ? (
              <>
                Choose a new password for <span className="font-medium text-fg">{email}</span>. Saving it signs you out
                on every other device.
              </>
            ) : (
              "Press Continue to finish signing in to Aurevia Estates in this browser."
            )}
          </p>
        </div>
        {error && error !== "weak_password" ? (
          <FormAlert message={authMessages[error]}>
            {linkDead ? (
              <Button href={routes.signIn} intent="secondary" size="sm">
                Get a new code
              </Button>
            ) : null}
          </FormAlert>
        ) : null}
        {type === "reset" ? (
          <Field
            id="confirm-password"
            label="New password"
            hint="At least 8 characters, with a letter and a number."
            error={fieldError}
            showError={submitted}
          >
            <Input name="password" type="password" autoComplete="new-password" required disabled={pending || linkDead} />
          </Field>
        ) : null}
        <Button type="submit" size="lg" loading={pending} disabled={linkDead} className="w-full">
          {type === "reset" ? "Save and sign in" : "Continue"}
        </Button>
      </form>
      {captcha.widget}
    </div>
  );
}
