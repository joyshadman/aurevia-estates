import type { Metadata } from "next";
import { Suspense } from "react";
import { Container, Eyebrow } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { backupCodesLeft, canEnrollTwoFactor, getSecurityState, requireUser, safeNext } from "@/lib/server/auth";
import { SecurityPanel } from "./security-panel";

export const metadata: Metadata = { title: "Two step verification" };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// `/account/security` (spec 0008, AC-9): turn on 2FA (password, QR code, first
// code, then backup codes), see and regenerate backup codes, turn it off.
// Agents arrive with `setup=required` until it is on.
export default function SecurityPage({ searchParams }: PageProps<"/account/security">) {
  return (
    <Container className="max-w-3xl py-10 sm:py-16">
      <Eyebrow>Account</Eyebrow>
      <h1 className="mt-2 font-display text-3xl text-fg sm:text-4xl">Two step verification</h1>
      <Suspense fallback={<Skeleton className="mt-10 h-80 w-full" />}>
        <SecurityContent searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function SecurityContent({ searchParams }: Pick<PageProps<"/account/security">, "searchParams">) {
  const params = await searchParams;
  const next = safeNext(first(params.next)) ?? undefined;
  await requireUser({ next: "/account/security" });
  const state = await getSecurityState();
  if (!state) return null;
  const enabled = state.user.twoFactorEnabled;

  return (
    <SecurityPanel
      isAgent={state.user.role === "AGENT"}
      setupRequired={first(params.setup) === "required" && !enabled}
      next={next}
      enabled={enabled}
      hasPassword={state.hasPassword}
      canEnroll={canEnrollTwoFactor(state)}
      fresh={state.twoFactorFresh}
      backupCodesLeft={enabled ? await backupCodesLeft(state.user.id) : 0}
    />
  );
}
