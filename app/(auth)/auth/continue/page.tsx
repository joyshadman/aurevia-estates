import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/app/(auth)/auth-shell";
import { Spinner } from "@/components/ui/spinner";
import { completeSignIn } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Signing you in" };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// Google's `callbackURL` (spec 0008, AC-5): Better Auth has set the session
// cookie by now; confirm it, then land on `next` or the default landing.
export default function ContinuePage({ searchParams }: PageProps<"/auth/continue">) {
  return (
    <AuthShell>
      <Suspense fallback={<Signing />}>
        <Continue searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function Continue({ searchParams }: Pick<PageProps<"/auth/continue">, "searchParams">) {
  const params = await searchParams;
  return completeSignIn(first(params.next));
}

function Signing() {
  return (
    <div className="flex items-center gap-3 text-fg-muted" role="status">
      <Spinner />
      Signing you in…
    </div>
  );
}
