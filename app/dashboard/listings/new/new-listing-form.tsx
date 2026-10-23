"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { propertyTypeLabels, propertyTypes } from "@/lib/domain/listing-card";
import { createDraft } from "../actions";
import { listingMessages } from "../messages";

const fieldMessages: Record<string, string> = {
  title: "Use 5 to 120 characters.",
  propertyType: "Choose a property type.",
  areaId: "Choose an area.",
};

export function NewListingForm({ areas }: { areas: { id: string; nameEn: string }[] }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    const form = new FormData(event.currentTarget);
    const input = {
      title: String(form.get("title") ?? ""),
      propertyType: String(form.get("propertyType") ?? "") as (typeof propertyTypes)[number],
      areaId: String(form.get("areaId") ?? ""),
    };
    // Success opens the edit page, so only a failure comes back.
    startTransition(async () => {
      const result = await createDraft(input);
      if (result.ok) return;
      if ("fieldErrors" in result && result.fieldErrors) {
        setErrors(Object.fromEntries(Object.keys(result.fieldErrors).map((key) => [key, fieldMessages[key] ?? listingMessages.invalid])));
        setFormError(null);
      } else {
        setFormError(listingMessages[result.reason]);
      }
    });
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6 rounded-3xl border border-line bg-surface-raised p-6 shadow-soft sm:p-8">
      {formError ? (
        <p role="alert" className="rounded-xl bg-danger-subtle px-4 py-3 text-sm text-danger-subtle-fg">
          {formError}
        </p>
      ) : null}
      <Field id="new-title" label="Title" hint="For example: Three bedroom apartment near Zindabazar" error={errors.title} showError={submitted}>
        <Input name="title" required minLength={5} maxLength={120} disabled={pending} />
      </Field>
      <Field id="new-type" label="Property type" error={errors.propertyType} showError={submitted}>
        <Select name="propertyType" required defaultValue="" disabled={pending}>
          <option value="" disabled>
            Choose a type
          </option>
          {propertyTypes.map((type) => (
            <option key={type} value={type}>
              {propertyTypeLabels[type]}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="new-area" label="Area" error={errors.areaId} showError={submitted}>
        <Select name="areaId" required defaultValue="" disabled={pending}>
          <option value="" disabled>
            Choose an area
          </option>
          {areas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.nameEn}
            </option>
          ))}
        </Select>
      </Field>
      <div>
        <Button type="submit" loading={pending}>
          Create draft
        </Button>
      </div>
    </form>
  );
}
