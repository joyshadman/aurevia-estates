"use client";

import { CircleCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { HCaptcha } from "@/components/about/hcaptcha";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { contactIntentLabels, contactIntents, type ContactIntent } from "@/lib/domain/contact";
import { propertyTypeLabels, propertyTypes, type PropertyType } from "@/lib/domain/listing-card";
import { submitContactAction } from "@/app/about/actions";

type Country = { code: string; name: string; dial: string };

const isIntent = (value: string | null): value is ContactIntent => contactIntents.includes(value as ContactIntent);

// The enquiry form (spec 0014). `?intent=sell` (the header's "Sell" link) picks
// the intent; a submission becomes a lead in the agent inbox.
export function ContactForm({ siteKey, countries }: { siteKey: string; countries: Country[] }) {
  const params = useSearchParams();
  const fromUrl = params.get("intent");
  const [intent, setIntent] = useState<ContactIntent>(isIntent(fromUrl) ? fromUrl : "buy");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("BD");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState(true);
  const [propertyType, setPropertyType] = useState<PropertyType | "">("");
  const [message, setMessage] = useState("");
  const [token, setToken] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const thanks = useRef<HTMLDivElement>(null);

  if (sentTo) {
    return (
      <div ref={thanks} tabIndex={-1} role="status" className="flex flex-col items-start gap-3 rounded-2xl bg-success-subtle p-6 text-success-subtle-fg outline-none">
        <CircleCheck aria-hidden="true" className="h-6 w-6" />
        <p className="font-display text-2xl">Thank you, {sentTo}.</p>
        <p className="text-sm">Your enquiry is with our advisors, and one of them will get back to you soon.</p>
      </div>
    );
  }

  function submit() {
    setFormError(null);
    if (!token) {
      setFormError("Please complete the check above the button.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await submitContactAction({
          name,
          email,
          phone,
          countryCode: country,
          whatsapp,
          intent,
          propertyType: propertyType || null,
          message,
          captchaToken: token,
        });
        if (result.ok) {
          setSentTo(result.name);
          requestAnimationFrame(() => thanks.current?.focus());
          return;
        }
        setResetKey((k) => k + 1);
        if (result.reason === "invalid") {
          setErrors(result.fieldErrors);
          setFormError("Check the highlighted fields.");
        } else if (result.reason === "captcha") {
          setErrors({});
          setFormError("The check didn't go through. Please try it again.");
        } else {
          setFormError("The form is closed right now. Please call or email us instead.");
        }
      } catch {
        setResetKey((k) => k + 1);
        setFormError("Couldn't send your enquiry. Please try again.");
      }
    });
  }

  return (
    <form
      noValidate
      aria-labelledby="contact-form-title"
      className="flex flex-col gap-4 rounded-2xl border border-line bg-surface-raised p-6 shadow-soft"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h3 id="contact-form-title" className="font-display text-2xl text-fg">
        Send an enquiry
      </h3>
      <Field id="contact-name" label="Full name" error={errors.name} showError>
        <Input value={name} maxLength={80} autoComplete="name" onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="contact-email" label="Email" hint="An email or a phone number" error={errors.email} showError>
          <Input type="email" value={email} maxLength={254} autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span id="contact-phone-label" className="text-sm font-medium text-fg">
            Phone
          </span>
          <div className="flex gap-2">
            <label htmlFor="contact-country" className="sr-only">
              Country
            </label>
            <Select id="contact-country" value={country} onChange={(e) => setCountry(e.target.value)} className="w-28">
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} {c.dial}
                </option>
              ))}
            </Select>
            <Input
              id="contact-phone"
              aria-labelledby="contact-phone-label"
              aria-describedby={errors.phone ? "contact-phone-error" : undefined}
              aria-invalid={errors.phone ? true : undefined}
              type="tel"
              autoComplete="tel-national"
              maxLength={30}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          {errors.phone ? (
            <p id="contact-phone-error" className="text-xs font-medium text-danger">
              {errors.phone}
            </p>
          ) : null}
        </div>
      </div>
      {phone.trim() ? <Checkbox id="contact-whatsapp" label="Reply on WhatsApp" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="contact-intent" label="I'd like to">
          <Select value={intent} onChange={(e) => setIntent(e.target.value as ContactIntent)}>
            {contactIntents.map((value) => (
              <option key={value} value={value}>
                {contactIntentLabels[value]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="contact-type" label="Property type (optional)">
          <Select value={propertyType} onChange={(e) => setPropertyType(e.target.value as PropertyType | "")}>
            <option value="">Any</option>
            {propertyTypes.map((value) => (
              <option key={value} value={value}>
                {propertyTypeLabels[value]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field id="contact-message" label="Message" error={errors.message} showError>
        <Textarea rows={4} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} />
      </Field>
      <HCaptcha siteKey={siteKey} onToken={setToken} resetKey={resetKey} />
      {formError ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {formError}
        </p>
      ) : null}
      <Button type="submit" loading={pending} className="self-start">
        Send enquiry
      </Button>
    </form>
  );
}
