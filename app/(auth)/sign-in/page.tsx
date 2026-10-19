import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Container } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { defaultLanding } from "@/lib/domain/auth-rules";
import { getCurrentUser } from "@/lib/server/auth";
import { cleanNext } from "@/lib/server/sign-in";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

// One page for every method (spec 0004, AC-1). Signed in users go straight on.
export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <Container className="flex justify-center py-16">
      <Suspense fallback={<Skeleton className="h-96 w-full max-w-md rounded-2xl" />}>
        <SignIn searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function SignIn({ searchParams }: { searchParams: PageProps<"/sign-in">["searchParams"] }) {
  const params = await searchParams;
  const next = cleanNext(first(params.next));
  const user = await getCurrentUser();
  if (user) redirect(next ?? defaultLanding(user.role));
  return <SignInForm next={next ?? ""} error={first(params.error) ?? null} />;
}
