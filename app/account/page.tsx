import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Container, Eyebrow } from "@/components/ui/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { authMessages, authReasonFrom } from "@/lib/auth/messages";
import { getSecurityState, requireUser } from "@/lib/server/auth";
import { getAuth } from "@/lib/server/auth-config";
import { db } from "@/lib/server/db";
import { countryOptions, splitPhone } from "@/lib/domain/phone-countries";
import { listMyViewings } from "@/lib/server/viewing-cards";
import { DeleteAccountPanel, LinkedMethods, PasswordForm, ProfileForm, SignOutPanel } from "./account-forms";
import { YourViewings } from "./your-viewings";

export const metadata: Metadata = { title: "Your account" };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// `/account` (spec 0008, AC-10): name and phone, password, linked sign in
// methods, and sign out on this device or everywhere.
export default function AccountPage({ searchParams }: PageProps<"/account">) {
  return (
    <Container className="max-w-3xl py-10 sm:py-16">
      <Eyebrow>Account</Eyebrow>
      <h1 className="mt-2 font-display text-3xl text-fg sm:text-4xl">Your account</h1>
      <Suspense fallback={<AccountSkeleton />}>
        <AccountContent searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function AccountContent({ searchParams }: Pick<PageProps<"/account">, "searchParams">) {
  const user = await requireUser({ next: "/account" });
  const [params, profile, state, accounts, viewings] = await Promise.all([
    searchParams,
    db.profile.findUniqueOrThrow({
      where: { id: user.id },
      select: { fullName: true, phone: true, phoneIsWhatsapp: true, email: true },
    }),
    getSecurityState(),
    // The `accounts` rows: `credential` (a password) and `google`.
    headers().then((requestHeaders) => getAuth().api.listUserAccounts({ headers: requestHeaders })),
    // Spec 0007, AC-11: visitors only.
    user.role === "VISITOR" ? listMyViewings(user) : null,
  ]);
  const linkError = authReasonFrom(first(params.error));
  const phone = splitPhone(profile.phone);
  const hasPassword = state?.hasPassword ?? false;

  return (
    <div className="mt-10 flex flex-col gap-8">
      <Panel title="Profile" description={profile.email}>
        <ProfileForm
          fullName={profile.fullName}
          national={phone.national}
          countryCode={phone.countryCode}
          whatsapp={profile.phoneIsWhatsapp}
          countries={countryOptions()}
        />
      </Panel>
      {viewings ? (
        <Panel id="viewings" title="Your viewings" description="Change or cancel up to 2 hours before. Times are Sylhet time.">
          <YourViewings upcoming={viewings.upcoming} recent={viewings.recent} />
        </Panel>
      ) : null}
      <Panel
        id="password"
        title="Password"
        description={
          hasPassword
            ? "Saving a new password signs you out on every other device."
            : "Add a password to sign in with it as well as email codes and Google."
        }
      >
        <PasswordForm hasPassword={hasPassword} />
      </Panel>
      <Panel title="Sign in methods" description="Ways you can sign in to this account.">
        <LinkedMethods
          error={linkError ? authMessages[linkError] : undefined}
          email={profile.email}
          methods={accounts.map((account) => ({ id: account.id, provider: account.providerId }))}
        />
      </Panel>
      <Panel title="Two step verification" description="Codes from an authenticator app keep your account safe.">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="flex items-center gap-2 text-sm text-fg-muted">
            <ShieldCheck aria-hidden="true" strokeWidth={1.5} className="h-4 w-4 text-accent" />
            {state?.user.twoFactorEnabled ? "On" : "Off"}
          </p>
          <Button href="/account/security" intent="secondary" size="sm">
            Manage
          </Button>
        </div>
      </Panel>
      <Panel title="Sign out">
        <SignOutPanel />
      </Panel>
      {/* Spec 0017, AC-4, AC-6: visitors delete themselves; agents ask the agency. */}
      <Panel id="delete" title="Delete account" description="Remove your account and personal details from Aurevia.">
        {user.role === "VISITOR" ? (
          <DeleteAccountPanel email={profile.email} />
        ) : (
          <p className="text-sm text-fg-muted">{authMessages.agent_account}</p>
        )}
      </Panel>
    </div>
  );
}

function Panel({ id, title, description, children }: { id?: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-3xl border border-line bg-surface-raised p-6 shadow-soft sm:p-8">
      <h2 className="font-display text-xl text-fg">{title}</h2>
      {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function AccountSkeleton() {
  return (
    <div className="mt-10 flex flex-col gap-8" aria-hidden="true">
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
