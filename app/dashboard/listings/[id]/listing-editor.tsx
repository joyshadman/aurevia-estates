"use client";

import { Check, Circle, ExternalLink, TriangleAlert } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { ListingStatusBadge } from "@/components/dashboard/listing-status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { googleMapsLink } from "@/lib/domain/geo";
import { propertyTypeLabels, propertyTypes, type PropertyType } from "@/lib/domain/listing-card";
import { listingFailureMessage, listingReasonMessages } from "@/lib/domain/listing-messages";
import { descriptionMax, fieldLabels } from "@/lib/domain/listing-schema";
import { publishChecklist } from "@/lib/domain/publish-checklist";
import type { ListingForEdit } from "@/lib/server/agent-listings";
import { publishListingAction, resolveLocationAction, saveListingAction } from "../actions";
import { EditorProvider, useEditor } from "./editor-context";
import { checklistValues, clearedByType, initialForm, parsePrice, toFields, visibleTypeFields, type FormText } from "./form-values";
import { LifecycleActions } from "./lifecycle-actions";
import { NearbyPlacesField } from "./nearby-places-field";
import { PhotoManager } from "./photo-manager";

type Props = {
  listing: ListingForEdit;
  areas: { id: string; nameEn: string }[];
  amenities: { id: string; label: string }[];
  agents: { id: string; fullName: string }[];
};

export function ListingEditor(props: Props) {
  return (
    <EditorProvider initialToken={props.listing.updatedAt} canEdit={props.listing.canEdit}>
      <Editor {...props} />
    </EditorProvider>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`section-${title}`} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface-raised p-6">
      <h2 id={`section-${title}`} className="font-display text-xl text-fg">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Editor({ listing, areas, amenities, agents }: Props) {
  const { token, stale, canEdit, settle } = useEditor();
  const [form, setForm] = useState<FormText>(() => initialForm(listing));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState<"save" | "publish" | null>(null);
  const [, startTransition] = useTransition();

  const set = <K extends keyof FormText>(key: K, value: FormText[K]) => setForm((f) => ({ ...f, [key]: value }));
  const visible = visibleTypeFields(form.propertyType);
  const clearing = clearedByType(form, form.propertyType);
  const checklist = publishChecklist(checklistValues(form), listing.photos);
  const price = parsePrice(form.price);
  const canPublish = listing.status === "DRAFT" || listing.status === "UNPUBLISHED";

  function submit(kind: "save" | "publish") {
    setSubmitted(true);
    const { fields, errors: local } = toFields(form);
    setErrors(local);
    if (Object.keys(local).length > 0) return;
    setPending(kind);
    startTransition(async () => {
      const action = kind === "save" ? saveListingAction : publishListingAction;
      const result = await action({ id: listing.id, expectedUpdatedAt: token, fields });
      setPending(null);
      if (!result.ok) setErrors(result.fieldErrors ?? {});
      settle(result, kind === "save" ? "Saved" : "Published");
    });
  }

  const err = (key: string) => errors[key];
  const numberField = (key: "bedrooms" | "bathrooms" | "builtUpSqft" | "floorNumber" | "totalFloors" | "parkingSpaces" | "landKatha", hint?: string) => (
    <Field key={key} id={key} label={fieldLabels[key]} hint={hint} error={err(key)} showError={submitted}>
      <Input inputMode={key === "landKatha" ? "decimal" : "numeric"} value={form[key]} onChange={(e) => set(key, e.target.value)} />
    </Field>
  );

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <div>
          <p className="text-sm text-fg-subtle">{listing.refCode}</p>
          <h1 className="font-display text-3xl text-fg">{form.title || "Untitled listing"}</h1>
        </div>

        {stale ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-warning-subtle px-4 py-3 text-sm text-warning-subtle-fg">
            <span>{listingReasonMessages.stale}</span>
            <Button size="sm" intent="secondary" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
        ) : null}

        {!canEdit ? (
          <p className="rounded-xl bg-surface-sunken px-4 py-3 text-sm text-fg-muted">
            {listing.status === "SOLD"
              ? "This listing is sold, so it can't be changed."
              : `You can view this listing. To change it, contact ${listing.advisorName === "Unassigned" ? listing.creatorName : listing.advisorName}.`}
          </p>
        ) : null}

        <fieldset disabled={!canEdit} className="flex min-w-0 flex-col gap-6">
          <legend className="sr-only">Listing details</legend>
          <Section title="Basics">
            <Field id="title" label="Title" error={err("title")} showError={submitted}>
              <Input value={form.title} maxLength={120} onChange={(e) => set("title", e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="propertyType" label="Property type">
                <Select value={form.propertyType} onChange={(e) => set("propertyType", e.target.value as PropertyType)}>
                  {propertyTypes.map((type) => (
                    <option key={type} value={type}>
                      {propertyTypeLabels[type]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="areaId" label="Area" error={err("areaId")} showError={submitted}>
                <Select value={form.areaId} onChange={(e) => set("areaId", e.target.value)}>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.nameEn}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {clearing.length > 0 ? (
              <p role="status" className="flex items-start gap-2 rounded-xl bg-warning-subtle px-4 py-3 text-sm text-warning-subtle-fg">
                <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                {`A ${propertyTypeLabels[form.propertyType].toLowerCase()} has no ${clearing.map((f) => fieldLabels[f].toLowerCase()).join(", ")}. Saving clears ${clearing.length === 1 ? "it" : "them"}.`}
              </p>
            ) : null}
            <Field id="addressLine" label="Address line" error={err("addressLine")} showError={submitted}>
              <Input value={form.addressLine} maxLength={200} onChange={(e) => set("addressLine", e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="priceBdt"
                label="Price (taka)"
                hint={price ? formatPrice(price) : "Whole taka, commas allowed"}
                error={err("priceBdt")}
                showError={submitted}
              >
                <Input inputMode="numeric" value={form.price} onChange={(e) => set("price", e.target.value)} />
              </Field>
              <div className="flex items-center sm:pt-7">
                <Checkbox
                  id="priceNegotiable"
                  label="Price is negotiable"
                  checked={form.priceNegotiable}
                  onChange={(e) => set("priceNegotiable", e.target.checked)}
                />
              </div>
            </div>
          </Section>

          <Section title="Details">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.includes("bedrooms") ? numberField("bedrooms") : null}
              {visible.includes("bathrooms") ? numberField("bathrooms") : null}
              {visible.includes("builtUpSqft") ? numberField("builtUpSqft") : null}
              {visible.includes("landKatha") ? numberField("landKatha") : null}
              {visible.includes("floorNumber") ? numberField("floorNumber", "Ground is 0") : null}
              {numberField("totalFloors")}
              {numberField("parkingSpaces")}
              {visible.includes("completionStatus") ? (
                <Field id="completionStatus" label={fieldLabels.completionStatus} error={err("completionStatus")} showError={submitted}>
                  <Select value={form.completionStatus} onChange={(e) => set("completionStatus", e.target.value as FormText["completionStatus"])}>
                    <option value="">Not set</option>
                    <option value="READY">Ready</option>
                    <option value="UNDER_CONSTRUCTION">Under construction</option>
                  </Select>
                </Field>
              ) : null}
              {form.completionStatus === "UNDER_CONSTRUCTION" && visible.includes("completionStatus") ? (
                <Field id="handoverDate" label={fieldLabels.handoverDate} error={err("handoverDate")} showError={submitted}>
                  <Input type="date" value={form.handoverDate} onChange={(e) => set("handoverDate", e.target.value)} />
                </Field>
              ) : null}
            </div>
          </Section>

          <Section title="Location">
            <LocationField form={form} set={set} error={err("latitude") ?? err("longitude")} showError={submitted} />
          </Section>

          <Section title="Around the address">
            <NearbyPlacesField rows={form.nearbyPlaces} onChange={(rows) => set("nearbyPlaces", rows)} errors={errors} showErrors={submitted} />
          </Section>

          <Section title="Amenities">
            <fieldset>
              <legend className="sr-only">Amenities</legend>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {amenities.map((amenity) => (
                  <Checkbox
                    key={amenity.id}
                    id={`amenity-${amenity.id}`}
                    label={amenity.label}
                    checked={form.amenityIds.includes(amenity.id)}
                    onChange={(e) =>
                      set(
                        "amenityIds",
                        e.target.checked ? [...form.amenityIds, amenity.id] : form.amenityIds.filter((id) => id !== amenity.id),
                      )
                    }
                  />
                ))}
              </div>
            </fieldset>
          </Section>

          <Section title="Description">
            <Field
              id="description"
              label="Description"
              hint={`Plain text. Leave a blank line between paragraphs. ${form.description.trim().length.toLocaleString("en-US")} of ${descriptionMax.toLocaleString("en-US")} characters; publishing needs at least 50.`}
              error={err("description")}
              showError={submitted}
            >
              <Textarea rows={8} maxLength={descriptionMax} value={form.description} onChange={(e) => set("description", e.target.value)} />
            </Field>
          </Section>
        </fieldset>

        <Section title="Photos">
          <PhotoManager listingId={listing.id} photos={listing.photos} />
        </Section>
      </div>

      <aside className="flex flex-col gap-5 rounded-2xl border border-line bg-surface-raised p-6 lg:sticky lg:top-24 lg:w-80">
        <div className="flex items-center justify-between gap-3">
          <ListingStatusBadge status={listing.status} />
          <span className="text-sm text-fg-subtle">{listing.refCode}</span>
        </div>
        <p className="text-sm text-fg-muted">
          Advisor: <span className="text-fg">{listing.advisorName}</span>
        </p>
        {/* Spec 0009, AC-10: see the page as buyers will, in any status. */}
        <Button href={`/dashboard/listings/${listing.id}/preview`} intent="ghost" size="sm" className="self-start">
          Preview page
        </Button>

        {listing.status !== "SOLD" ? (
          <div>
            <h2 className="text-sm font-medium text-fg">To publish</h2>
            <ul className="mt-2 flex flex-col gap-1.5 text-sm">
              {checklist.items.map((item) => (
                <li key={item.key} className={cn("flex items-center gap-2", item.done ? "text-fg-muted" : "text-fg")}>
                  {item.done ? (
                    <Check aria-hidden="true" className="h-4 w-4 text-success" />
                  ) : (
                    <Circle aria-hidden="true" className="h-4 w-4 text-fg-subtle" />
                  )}
                  <span>
                    {item.label}
                    <span className="sr-only">{item.done ? ", done" : ", missing"}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {canEdit ? (
          <div className="flex flex-col gap-2">
            <Button intent={canPublish ? "secondary" : "primary"} onClick={() => submit("save")} loading={pending === "save"} disabled={pending !== null}>
              Save
            </Button>
            {canPublish ? (
              <Button
                onClick={() => submit("publish")}
                loading={pending === "publish"}
                disabled={!checklist.complete || pending !== null}
                aria-describedby={checklist.complete ? undefined : "publish-hint"}
              >
                {listing.status === "UNPUBLISHED" ? "Publish again" : "Publish"}
              </Button>
            ) : null}
            {canPublish && !checklist.complete ? (
              <p id="publish-hint" className="text-xs text-fg-subtle">
                Publish turns on once every item above is done.
              </p>
            ) : null}
            {listing.status === "PUBLISHED" ? (
              <p className="text-xs text-fg-subtle">This listing is live. Saved changes reach buyers at once.</p>
            ) : null}
          </div>
        ) : null}

        <LifecycleActions listingId={listing.id} status={listing.status} assignedAgentId={listing.assignedAgentId} agents={agents} />
      </aside>
    </div>
  );
}

// Paste coordinates or a Google Maps link; the server reads the point (AC-7).
function LocationField({
  form,
  set,
  error,
  showError,
}: {
  form: FormText;
  set: <K extends keyof FormText>(key: K, value: FormText[K]) => void;
  error?: string;
  showError: boolean;
}) {
  const { canEdit } = useEditor();
  const [input, setInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const lat = Number(form.latitude);
  const lng = Number(form.longitude);
  const hasPoint = form.latitude !== "" && form.longitude !== "" && Number.isFinite(lat) && Number.isFinite(lng);

  function find() {
    if (!input.trim()) return;
    startTransition(async () => {
      const result = await resolveLocationAction(input);
      if (!result.ok) {
        setMessage(listingFailureMessage(result));
        return;
      }
      set("latitude", String(result.latitude));
      set("longitude", String(result.longitude));
      setMessage(null);
      setInput("");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {canEdit ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field
            id="location-input"
            label="Coordinates or Google Maps link"
            hint="On a phone, long press the pin in Google Maps and copy the numbers."
            error={message ?? undefined}
            showError
            className="flex-1"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  find();
                }
              }}
              placeholder="24.8949, 91.8687"
            />
          </Field>
          <Button intent="secondary" onClick={find} loading={pending} disabled={!input.trim()} className="sm:mb-6">
            Find
          </Button>
        </div>
      ) : null}
      {hasPoint ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-fg">
            {lat.toFixed(6)}, {lng.toFixed(6)}
          </span>
          <a href={googleMapsLink(lat, lng)} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-accent hover:underline">
            Open in Google Maps
            <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
          {canEdit ? (
            <Button
              size="sm"
              intent="ghost"
              onClick={() => {
                set("latitude", "");
                set("longitude", "");
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-fg-muted">No location yet.</p>
      )}
      {showError && error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
