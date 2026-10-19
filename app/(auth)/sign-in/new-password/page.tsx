import type { Metadata } from "next";
import { Suspense } from "react";
import { Container } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/server/auth";
import { NewPasswordForm } from "./new-password-form";

export const metadata: Metadata = { title: "Set a new password", robots: { index: false } };

// After a recovery code or link (spec 0004, AC-7). The action sends a user with
// an authenticator through `/mfa` first.
export default function NewPasswordPage() {
  return (
    <Container className="flex justify-center py-16">
      <Suspense fallback={<Skeleton className="h-64 w-full max-w-md rounded-2xl" />}>
        <NewPassword />
      </Suspense>
    </Container>
  );
}

async function NewPassword() {
  await requireUser({ next: "/sign-in/new-password" });
  return <NewPasswordForm />;
}
