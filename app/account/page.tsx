import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Container } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { listMyViewings, phoneCountries } from "@/lib/server/viewing-bookings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AccountForms } from "./account-forms";
import { YourViewings } from "./your-viewings";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };

// The account page (spec 0004, AC-10): profile, password, linked methods, sign
// out; plus "Your viewings" for visitors (spec 0007, AC-11).
export default function AccountPage() {
  return (
    <Container className="flex flex-col gap-8 py-10">
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
        <Account />
      </Suspense>
    </Container>
  );
}

async function Account() {
  const user = await requireUser({ next: "/account" });
  const supabase = await createSupabaseServerClient();
  const [profile, identities, viewings] = await Promise.all([
    db.profile.findUniqueOrThrow({ where: { id: user.id }, select: { fullName: true, phone: true, phoneIsWhatsapp: true } }),
    supabase.auth.getUserIdentities(),
    listMyViewings(user),
  ]);
  const parsed = profile.phone ? parsePhoneNumberFromString(profile.phone) : undefined;
  const countries = [...phoneCountries()].sort((a, b) => (a.code === "BD" ? -1 : b.code === "BD" ? 1 : 0));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-fg">Your account</h1>
          <p className="mt-1 text-sm text-fg-muted">{user.email}</p>
        </div>
        <Link href="/account/security" className="text-sm text-accent hover:underline">
          Authenticator app
        </Link>
      </div>
      {user.role === "VISITOR" ? <YourViewings initial={viewings} /> : null}
      <AccountForms
        profile={{
          fullName: profile.fullName ?? "",
          phone: parsed?.nationalNumber ?? "",
          countryCode: parsed?.country ?? "BD",
          whatsapp: profile.phoneIsWhatsapp,
        }}
        countries={countries}
        identities={(identities.data?.identities ?? []).map((i) => ({ id: i.identity_id, provider: i.provider, email: (i.identity_data?.email as string | undefined) ?? null }))}
      />
    </>
  );
}
