import type { Metadata } from "next";
import { Suspense } from "react";
import { Container } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { STALE_UNVERIFIED_FACTOR_MS } from "@/lib/domain/auth-rules";
import { mfaState, requireUser } from "@/lib/server/auth";
import { cleanNext } from "@/lib/server/sign-in";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SecurityPanel } from "./security-panel";

export const metadata: Metadata = { title: "Authenticator app", robots: { index: false } };

// Removes unverified factors older than an hour, then returns the verified ones.
async function removeStaleFactors() {
  const supabase = await createSupabaseServerClient();
  const before = await mfaState();
  const cutoff = Date.now() - STALE_UNVERIFIED_FACTOR_MS;
  const stale = before.all.filter((f) => f.status === "unverified" && new Date(f.created_at).getTime() < cutoff);
  for (const factor of stale) await supabase.auth.mfa.unenroll({ factorId: factor.id });
  return stale.length > 0 ? (await mfaState()).verified : before.verified;
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

// Authenticators (spec 0004, AC-9): enroll, verify, remove. Unverified factors
// older than an hour are removed when the page loads.
export default function SecurityPage({ searchParams }: PageProps<"/account/security">) {
  return (
    <Container className="flex flex-col gap-8 py-10">
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
        <Security searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function Security({ searchParams }: { searchParams: PageProps<"/account/security">["searchParams"] }) {
  const params = await searchParams;
  const next = cleanNext(first(params.next)) ?? "";
  const user = await requireUser({ next: "/account/security" });
  const verified = await removeStaleFactors();

  return (
    <SecurityPanel
      isAgent={user.role === "AGENT"}
      setupRequired={first(params.setup) === "required"}
      next={next}
      factors={verified.map((f) => ({ id: f.id, name: f.friendly_name ?? "Authenticator", createdAt: f.created_at }))}
    />
  );
}
