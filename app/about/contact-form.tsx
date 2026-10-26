"use client";

import { CircleCheck } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";
import { useInvisibleCaptcha } from "@/app/(auth)/captcha";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { CountryOption } from "@/lib/domain/phone-countries";
import { sendContact } from "./actions";
import { contactMessages, type ContactReason } from "./messages";

const interests = [
  { value: "BUY", label: "Buy a home" },
  { value: "SELL", label: "Sell my property" },
  { value: "OTHER", label: "Something else" },
] as const;

const fieldFor: Partial<Record<ContactReason, string>> = {
  invalid_name: "name",
  invalid_email: "email",
  invalid_phone: "phone",
  invalid_message: "message",
};

// The contact form (spec 0015): becomes a lead in the agents' inbox.
export function ContactForm({ countries }: { countries: CountryOption[] }) {
  const { token, widget } = useInvisibleCaptcha();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ContactReason | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "");
    startTransition(async () => {
      const captchaToken = await token();
      if (!captchaToken) {
        setError("captcha_failed");
        return;
      }
      const result = await sendContact({
        name,
        email: String(form.get("email") ?? ""),
        phone: String(form.get("phone") ?? ""),
        countryCode: String(form.get("countryCode") ?? "BD"),
        interest: String(form.get("interest") ?? "BUY") as (typeof interests)[number]["value"],
        message: String(form.get("message") ?? ""),
        whatsapp: form.get("whatsapp") === "on",
        captchaToken,
      });
      if (result.ok) {
        setError(null);
        setSentTo(name.trim().split(/\s+/)[0] || "you");
      } else {
        setError(result.reason);
      }
    });
  };

  if (sentTo) {
    return (
      <div role="status" className="rounded-3xl border border-line bg-surface-raised p-10 text-center shadow-soft">
        <CircleCheck aria-hidden="true" strokeWidth={1.5} className="mx-auto h-12 w-12 text-success" />
        <p className="mt-5 font-display text-3xl text-fg">Thank you, {sentTo}.</p>
        <p className="mx-auto mt-3 max-w-sm text-fg-muted">An Aurevia advisor will contact you within one working day.</p>
      </div>
    );
  }

  const fieldError = (field: string) => (error && fieldFor[error] === field ? contactMessages[error] : undefined);
  const formError = error && !fieldFor[error] ? contactMessages[error] : null;

  return (
    <form onSubmit={submit} noValidate className="rounded-3xl border border-line bg-surface-raised p-6 shadow-soft sm:p-10">
      <h3 className="font-display text-2xl text-fg">Send an enquiry</h3>
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <Field id="contact-name" label="Full name" error={fieldError("name")} showError>
          <Input name="name" autoComplete="name" maxLength={80} required disabled={pending} />
        </Field>
        <Field id="contact-email" label="Email" hint="Optional" error={fieldError("email")} showError>
          <Input name="email" type="email" autoComplete="email" maxLength={200} disabled={pending} />
        </Field>
        <Field id="contact-country" label="Country">
          <Select name="countryCode" defaultValue="BD" autoComplete="country" disabled={pending}>
            {countries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="contact-phone" label="Phone" error={fieldError("phone")} showError>
          <Input name="phone" type="tel" autoComplete="tel-national" maxLength={40} required disabled={pending} />
        </Field>
        <Field id="contact-interest" label="I'd like to" className="sm:col-span-2">
          <Select name="interest" defaultValue="BUY" disabled={pending}>
            {interests.map((interest) => (
              <option key={interest.value} value={interest.value}>
                {interest.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="contact-message" label="Message" error={fieldError("message")} showError className="sm:col-span-2">
          <Textarea name="message" rows={5} maxLength={1000} required disabled={pending} />
        </Field>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <Checkbox id="contact-whatsapp" name="whatsapp" defaultChecked label="Reply on WhatsApp" disabled={pending} />
        <Button type="submit" loading={pending}>
          Send enquiry
        </Button>
      </div>
      {formError ? (
        <p role="alert" className="mt-4 rounded-xl bg-danger-subtle px-4 py-3 text-sm text-danger-subtle-fg">
          {formError}
        </p>
      ) : null}
      <div className="mt-6">{widget}</div>
    </form>
  );
}
