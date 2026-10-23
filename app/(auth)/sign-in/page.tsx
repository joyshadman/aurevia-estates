import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthShell } from "@/app/(auth)/auth-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { authReasonFrom } from "@/lib/auth/messages";
import { pendingTwoFactor, safeNext, signInRedirectTarget } from "@/lib/server/auth";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// `/sign-in` (spec 0008, AC-1). The session and query reads stream in behind
// Suspense; the panel beside them is static.
export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <AuthShell>
      <Suspense fallback={<FormSkeleton />}>
        <SignInGate searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function SignInGate({ searchParams }: Pick<PageProps<"/sign-in">, "searchParams">) {
  const params = await searchParams;
  const next = safeNext(first(params.next)) ?? undefined;
  let error = authReasonFrom(first(params.error));

  // The authenticator step comes from Better Auth's 2FA cookie, not the query
  // alone, so a reload keeps it and a stale `?step=2fa` doesn't (AC-8).
  const wantsTwoFactor = first(params.step) === "2fa";
  if (wantsTwoFactor && (await pendingTwoFactor())) {
    return <SignInForm key="2fa" next={next} initialError={error} initialStep="2fa" />;
  }
  if (wantsTwoFactor) error ??= "two_factor_expired";

  // Already signed in: go where the sign in would have gone (AC-1). Not for an
  // agent sent back to sign in again, whose session lacks a recent
  // authenticator code: they get the password step, not a loop (AC-8).
  if (error !== "agent_reauth") {
    const target = await signInRedirectTarget(next ?? null);
    if (target) redirect(target);
  }

  // Keyed by step: a password sign in that needs a code redirects back to this
  // same page, and the form must start over on the new step.
  const passwordFirst = error === "agent_reauth" || error === "two_factor_expired" || error === "too_many_attempts";
  return (
    <SignInForm key="start" next={next} initialError={error} initialMethod={passwordFirst ? "password" : "code"} />
  );
}

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <Skeleton className="h-10 w-3/4" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}
