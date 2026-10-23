import type { Metadata } from "next";
import { Suspense } from "react";
import { z } from "zod";
import { AuthShell } from "@/app/(auth)/auth-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { authMessages, codeLength } from "@/lib/auth/messages";
import { routes } from "@/lib/nav";
import { safeNext } from "@/lib/server/auth";
import { ConfirmForm } from "./confirm-form";

export const metadata: Metadata = { title: "Continue signing in" };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const linkShape = z.object({
  type: z.enum(["sign-in", "verify", "reset"]),
  email: z.string().trim().toLowerCase().max(320).pipe(z.email()),
  code: z.string().regex(new RegExp(String.raw`^\d{${codeLength}}$`)),
});

// Email links land here (spec 0008, AC-2, AC-7). Opening the page never uses
// the code, so mail scanners that prefetch links can't use it up; only
// Continue (or saving the new password) does. Sent with `no-referrer` and
// `no-store` (`next.config.ts`).
export default function ConfirmPage({ searchParams }: PageProps<"/auth/confirm">) {
  return (
    <AuthShell>
      <Suspense fallback={<Skeleton className="h-56 w-full" />}>
        <ConfirmGate searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function ConfirmGate({ searchParams }: Pick<PageProps<"/auth/confirm">, "searchParams">) {
  const params = await searchParams;
  const link = linkShape.safeParse({ type: first(params.type), email: first(params.email), code: first(params.code) });

  if (!link.success) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-3xl leading-tight text-fg">This link didn&apos;t work</h1>
        <p role="alert" className="text-base text-fg-muted">
          {authMessages.link_invalid}
        </p>
        <Button href={routes.signIn} size="lg" className="w-full">
          Get a new code
        </Button>
      </div>
    );
  }

  return <ConfirmForm {...link.data} next={safeNext(first(params.next)) ?? undefined} />;
}
