"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { authMessage, type AuthFailure } from "@/lib/domain/auth-messages";
import { signOutAction, signOutEverywhereAction } from "@/app/(auth)/actions";
import { changePasswordAction, requestReauthAction, unlinkIdentityAction, updateProfileAction } from "./actions";

type Props = {
  profile: { fullName: string; phone: string; countryCode: string; whatsapp: boolean };
  countries: { code: string; name: string; dial: string }[];
  identities: { id: string; provider: string; email: string | null }[];
};

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface-raised p-6">
      <h2 className="font-display text-xl text-fg">{title}</h2>
      {children}
    </section>
  );
}

const failToast = (result: AuthFailure) => {
  toast({ tone: "danger", title: authMessage(result.reason) ?? "Something went wrong." });
};

export function AccountForms({ profile, countries, identities }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(profile.fullName);
  const [phone, setPhone] = useState(profile.phone);
  const [country, setCountry] = useState(profile.countryCode);
  const [whatsapp, setWhatsapp] = useState(profile.whatsapp);
  const [password, setPassword] = useState("");
  const [nonce, setNonce] = useState("");
  const [codeSent, setCodeSent] = useState(false);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Your details">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const result = await updateProfileAction({ fullName: name, phone, countryCode: country, whatsapp });
              if (!result.ok) return failToast(result);
              toast({ tone: "success", title: "Saved" });
              router.refresh();
            });
          }}
        >
          <Field id="full-name" label="Name">
            <Input value={name} maxLength={80} autoComplete="name" onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span id="phone-label" className="text-sm font-medium text-fg">
              Phone
            </span>
            <div className="flex gap-2">
              <label htmlFor="phone-country" className="sr-only">
                Country
              </label>
              <Select id="phone-country" value={country} onChange={(e) => setCountry(e.target.value)} className="w-32">
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} {c.dial}
                  </option>
                ))}
              </Select>
              <Input id="phone" aria-labelledby="phone-label" type="tel" autoComplete="tel-national" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <Checkbox id="phone-whatsapp" label="This number is on WhatsApp" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} />
          <Button type="submit" loading={pending} className="self-end">
            Save
          </Button>
        </form>
      </Card>

      <Card title="Password">
        <p className="text-sm text-fg-muted">To set or change your password, we email you a confirmation code first.</p>
        {codeSent ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const result = await changePasswordAction({ password, nonce });
                if (!result.ok) {
                  if (result.reason === "mfa_required") router.push("/mfa?next=%2Faccount");
                  return failToast(result);
                }
                toast({ tone: "success", title: "Password saved" });
                setPassword("");
                setNonce("");
                setCodeSent(false);
              });
            }}
          >
            <Field id="reauth-code" label="Code from the email">
              <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={nonce} onChange={(e) => setNonce(e.target.value)} />
            </Field>
            <Field id="new-password" label="New password" hint="At least 8 characters with a letter and a number.">
              <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Button type="submit" loading={pending} className="self-end">
              Save password
            </Button>
          </form>
        ) : (
          <Button
            intent="secondary"
            className="self-start"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await requestReauthAction();
                if (!result.ok) return failToast(result);
                setCodeSent(true);
              })
            }
          >
            Email me a code
          </Button>
        )}
      </Card>

      <Card title="Ways to sign in">
        <ul className="flex flex-col divide-y divide-line">
          {identities.map((identity) => (
            <li key={identity.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <span className="text-fg">
                {identity.provider === "email" ? "Email and password or code" : identity.provider === "google" ? "Google" : identity.provider}
                {identity.email ? <span className="block text-xs text-fg-subtle">{identity.email}</span> : null}
              </span>
              {identities.length > 1 ? (
                <Button
                  size="sm"
                  intent="ghost"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await unlinkIdentityAction({ identityId: identity.id });
                      if (!result.ok) {
                        if (result.reason === "mfa_required") router.push("/mfa?next=%2Faccount");
                        return failToast(result);
                      }
                      toast({ tone: "success", title: "Removed" });
                      router.refresh();
                    })
                  }
                >
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Sign out">
        <div className="flex flex-wrap gap-3">
          <form action={signOutAction}>
            <Button type="submit" intent="secondary">
              Sign out
            </Button>
          </form>
          <form action={signOutEverywhereAction}>
            <Button type="submit" intent="ghost">
              Sign out everywhere
            </Button>
          </form>
        </div>
        <p className="text-xs text-fg-subtle">Sign out everywhere ends your sessions on every device, including this one.</p>
      </Card>
    </div>
  );
}
