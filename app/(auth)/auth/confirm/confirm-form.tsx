"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { authMessage } from "@/lib/domain/auth-messages";
import { confirmEmailLinkAction, type SignInState } from "../../actions";

export function ConfirmForm({ tokenHash, type, next, valid }: { tokenHash: string; type: string; next: string; valid: boolean }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(confirmEmailLinkAction, null);
  const message = !valid ? authMessage("link_invalid") : state && !state.ok ? authMessage(state.reason) : null;
  return (
    <form action={action} className="flex w-full max-w-md flex-col gap-6 rounded-2xl border border-line bg-surface-raised p-8">
      <h1 className="font-display text-3xl text-fg">{type === "recovery" ? "Reset your password" : "Continue signing in"}</h1>
      {message ? (
        <p role="alert" className="rounded-xl bg-danger-subtle px-4 py-3 text-sm text-danger-subtle-fg">
          {message} <Link href="/sign-in" className="underline">Back to sign in</Link>
        </p>
      ) : null}
      <input type="hidden" name="tokenHash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="next" value={next} />
      <Button type="submit" loading={pending} disabled={!valid}>
        Continue
      </Button>
    </form>
  );
}
