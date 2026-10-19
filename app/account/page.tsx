import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Container } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/server/auth";
import { listMyViewings } from "@/lib/server/viewing-bookings";
import { YourViewings } from "./your-viewings";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };

// The account page. Spec 0004 adds profile, password, linked sign in methods,
// and the phone field with its WhatsApp tick; feature 8 adds "Your viewings"
// (spec 0007, AC-11).
export default function AccountPage() {
  return (
    <Container className="flex flex-col gap-8 py-10">
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        <Account />
      </Suspense>
    </Container>
  );
}

async function Account() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=%2Faccount");
  const viewings = await listMyViewings(user);
  return (
    <>
      <h1 className="font-display text-3xl text-fg">Your account</h1>
      {user.role === "VISITOR" ? <YourViewings initial={viewings} /> : null}
    </>
  );
}
