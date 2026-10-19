import type { Metadata } from "next";
import { Suspense } from "react";
import { Container } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { cleanNext } from "@/lib/server/sign-in";
import { ConfirmForm } from "./confirm-form";

export const metadata: Metadata = { title: "Continue signing in", robots: { index: false } };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

// Email links land here. Opening the page never spends the token (mail scanners
// open links); only the Continue button does (spec 0004, AC-2).
export default function ConfirmPage({ searchParams }: PageProps<"/auth/confirm">) {
  return (
    <Container className="flex justify-center py-16">
      <Suspense fallback={<Skeleton className="h-64 w-full max-w-md rounded-2xl" />}>
        <Confirm searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function Confirm({ searchParams }: { searchParams: PageProps<"/auth/confirm">["searchParams"] }) {
  const params = await searchParams;
  const tokenHash = first(params.token_hash) ?? "";
  const type = first(params.type) ?? "";
  const valid = tokenHash.length >= 10 && ["email", "recovery", "signup"].includes(type);
  return <ConfirmForm tokenHash={tokenHash} type={type} next={cleanNext(first(params.next)) ?? ""} valid={valid} />;
}
