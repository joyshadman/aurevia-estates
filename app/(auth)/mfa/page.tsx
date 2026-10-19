import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Container } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { mfaState, requireUser } from "@/lib/server/auth";
import { cleanNext } from "@/lib/server/sign-in";
import { MfaForm } from "./mfa-form";

export const metadata: Metadata = { title: "Authenticator code", robots: { index: false } };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

// The TOTP challenge (spec 0004, AC-8). The factor picker defaults to the most
// recently verified factor. No factor yet: set one up first.
export default function MfaPage({ searchParams }: PageProps<"/mfa">) {
  return (
    <Container className="flex justify-center py-16">
      <Suspense fallback={<Skeleton className="h-64 w-full max-w-md rounded-2xl" />}>
        <Mfa searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function Mfa({ searchParams }: { searchParams: PageProps<"/mfa">["searchParams"] }) {
  const params = await searchParams;
  const next = cleanNext(first(params.next)) ?? "";
  await requireUser({ next: `/mfa${next ? `?next=${encodeURIComponent(next)}` : ""}` });
  const { verified } = await mfaState();
  if (verified.length === 0) redirect(`/account/security?setup=required&next=${encodeURIComponent(next)}`);
  const factors = [...verified]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map((f) => ({ id: f.id, name: f.friendly_name ?? "Authenticator" }));
  return <MfaForm factors={factors} next={next} />;
}
