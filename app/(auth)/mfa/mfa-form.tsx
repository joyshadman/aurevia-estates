"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { authMessage } from "@/lib/domain/auth-messages";
import { challengeMfaAction, type SignInState } from "../actions";

export function MfaForm({ factors, next }: { factors: { id: string; name: string }[]; next: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(challengeMfaAction, null);
  return (
    <form action={action} className="flex w-full max-w-md flex-col gap-6 rounded-2xl border border-line bg-surface-raised p-8">
      <div>
        <h1 className="font-display text-3xl text-fg">Authenticator code</h1>
        <p className="mt-1 text-sm text-fg-muted">Enter the 6 digit code from your authenticator app. Agents confirm a code every 12 hours.</p>
      </div>
      {state && !state.ok ? (
        <p role="alert" className="rounded-xl bg-danger-subtle px-4 py-3 text-sm text-danger-subtle-fg">
          {authMessage(state.reason)}
        </p>
      ) : null}
      <input type="hidden" name="next" value={next} />
      {factors.length > 1 ? (
        <Field id="factorId" label="Authenticator">
          <Select name="factorId" defaultValue={factors[0].id}>
            {factors.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <input type="hidden" name="factorId" value={factors[0].id} />
      )}
      <Field id="code" label="Code">
        <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required className="text-lg tracking-[0.4em]" />
      </Field>
      <Button type="submit" loading={pending}>
        Continue
      </Button>
    </form>
  );
}
