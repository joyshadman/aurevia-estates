"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authMessage } from "@/lib/domain/auth-messages";
import { setNewPasswordAction, type SignInState } from "../../actions";

export function NewPasswordForm() {
  const [state, action, pending] = useActionState<SignInState, FormData>(setNewPasswordAction, null);
  return (
    <form action={action} className="flex w-full max-w-md flex-col gap-6 rounded-2xl border border-line bg-surface-raised p-8">
      <h1 className="font-display text-3xl text-fg">Set a new password</h1>
      {state && !state.ok ? (
        <p role="alert" className="rounded-xl bg-danger-subtle px-4 py-3 text-sm text-danger-subtle-fg">
          {authMessage(state.reason)}
        </p>
      ) : null}
      <Field id="password" label="New password" hint="At least 8 characters with a letter and a number.">
        <Input name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Button type="submit" loading={pending}>
        Save and continue
      </Button>
    </form>
  );
}
