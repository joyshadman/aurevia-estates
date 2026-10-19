"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { propertyTypeLabels, propertyTypes } from "@/lib/domain/listing-card";
import { listingFailureMessage } from "@/lib/domain/listing-messages";
import { createDraftAction, type NewListingState } from "../actions";

// Title, type, and area make a draft (spec 0005, AC-2).
export function NewListingForm({ areas }: { areas: { id: string; nameEn: string }[] }) {
  const [state, action, pending] = useActionState<NewListingState, FormData>(createDraftAction, null);
  const [submitted, setSubmitted] = useState(false);
  const errors = state?.fieldErrors ?? {};

  return (
    <form
      action={action}
      onSubmit={() => setSubmitted(true)}
      className="flex flex-col gap-5 rounded-2xl border border-line bg-surface-raised p-6"
      noValidate
    >
      <Field id="title" label="Title" hint="5 to 120 characters, like “Garden view apartment in Uposhohor”." error={errors.title} showError={submitted}>
        <Input name="title" required minLength={5} maxLength={120} autoComplete="off" />
      </Field>
      <Field id="propertyType" label="Property type" error={errors.propertyType} showError={submitted}>
        <Select name="propertyType" required defaultValue="APARTMENT">
          {propertyTypes.map((type) => (
            <option key={type} value={type}>
              {propertyTypeLabels[type]}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="areaId" label="Area" error={errors.areaId} showError={submitted}>
        <Select name="areaId" required defaultValue="">
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
      {state && state.reason !== "invalid" ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {listingFailureMessage(state)}
        </p>
      ) : null}
      <div className="flex justify-end gap-3">
        <Button href="/dashboard/listings" intent="ghost">
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          Create draft
        </Button>
      </div>
    </form>
  );
}
