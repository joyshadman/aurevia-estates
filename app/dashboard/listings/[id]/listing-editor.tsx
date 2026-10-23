"use client";

import { Check, Circle, Info, RotateCw } from "lucide-react";
import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { propertyTypeLabels, propertyTypes, type PropertyType } from "@/lib/domain/listing-card";
import { descriptionMax, maxPriceBdt, typeRules, type TypeField } from "@/lib/domain/listing-schema";
import { publishChecklist, typeFieldLabels } from "@/lib/domain/publish-checklist";
import { formatPrice } from "@/lib/format";
import type { ListingStatus } from "@/lib/generated/prisma/enums";
import type { ListingForEdit, ListingFormValues, PhotoDTO } from "@/lib/server/agent-listings";
import { deleteDraft, markSold, publish, reassign, saveListing, unpublish } from "../actions";
import { listingMessages, type ListingMessageReason } from "../messages";
import { statusBadge } from "../status";
import { LocationField } from "./location-field";
import { PhotoManager } from "./photo-manager";

export type ActionOutcome<T extends object = object> =
  | ({ ok: true; updatedAt: string; formStale?: true } & T)
  | { ok: false; reason: ListingMessageReason; missing?: string[]; fieldErrors?: Record<string, string> };

// The result type comes from each action, so `done` sees its own success fields.
export type RunAction = <R extends ActionOutcome>(call: (token: string) => Promise<R>, done?: (result: R) => void) => void;

// ---------------------------------------------------------------------------
// Form state: inputs hold text; `parse` turns it into the values the checklist
// and the server see.

const numberFields = ["bedrooms", "bathrooms", "builtUpSqft", "landKatha", "floorNumber", "totalFloors", "parkingSpaces"] as const;
type NumberField = (typeof numberFields)[number];

type FormText = {
  title: string;
  propertyType: PropertyType;
  areaId: string;
  addressLine: string;
  price: string;
  priceNegotiable: boolean;
  completionStatus: "" | "READY" | "UNDER_CONSTRUCTION";
  handoverDate: string;
  description: string;
  latitude: number | null;
  longitude: number | null;
  amenityIds: string[];
} & Record<NumberField, string>;

const fieldLabels: Record<string, string> = {
  title: "Title",
  propertyType: "Property type",
  areaId: "Area",
  addressLine: "Address",
  priceBdt: "Price",
  description: "Description",
  latitude: "Location",
  longitude: "Location",
  handoverDate: "Handover date",
  totalFloors: "Total floors",
  parkingSpaces: "Parking spaces",
  amenityIds: "Amenities",
  ...typeFieldLabels,
};

function toText(values: ListingFormValues): FormText {
  const text = (value: number | null) => (value === null ? "" : String(value));
  return {
    title: values.title,
    propertyType: values.propertyType,
    areaId: values.areaId,
    addressLine: values.addressLine ?? "",
    price: values.priceBdt === null ? "" : values.priceBdt.toLocaleString("en-US"),
    priceNegotiable: values.priceNegotiable,
    completionStatus: values.completionStatus ?? "",
    handoverDate: values.handoverDate ?? "",
    description: values.description ?? "",
    latitude: values.latitude,
    longitude: values.longitude,
    amenityIds: values.amenityIds,
    bedrooms: text(values.bedrooms),
    bathrooms: text(values.bathrooms),
    builtUpSqft: text(values.builtUpSqft),
    landKatha: text(values.landKatha),
    floorNumber: text(values.floorNumber),
    totalFloors: text(values.totalFloors),
    parkingSpaces: text(values.parkingSpaces),
  };
}

// AC-6: whole taka, commas allowed.
function parsePrice(text: string): number | null | "invalid" {
  const plain = text.replace(/[,\s]/g, "");
  if (!plain) return null;
  if (!/^\d+$/.test(plain)) return "invalid";
  const value = Number(plain);
  return value >= 1 && value <= maxPriceBdt ? value : "invalid";
}

function parse(form: FormText): { values: ListingFormValues; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const numbers = {} as Record<NumberField, number | null>;
  for (const field of numberFields) {
    const raw = form[field].trim();
    const value = raw === "" ? null : Number(raw);
    if (value !== null && !Number.isFinite(value)) errors[field] = "Enter a number";
    numbers[field] = value !== null && Number.isFinite(value) ? value : null;
  }
  const price = parsePrice(form.price);
  if (price === "invalid") errors.priceBdt = "Enter whole taka from 1 to 10,000,000,000";
  return {
    values: {
      title: form.title.trim(),
      propertyType: form.propertyType,
      areaId: form.areaId,
      addressLine: form.addressLine.trim() || null,
      priceBdt: price === "invalid" ? null : price,
      priceNegotiable: form.priceNegotiable,
      completionStatus: form.completionStatus || null,
      handoverDate: form.handoverDate || null,
      description: form.description.trim() || null,
      latitude: form.latitude,
      longitude: form.longitude,
      amenityIds: form.amenityIds,
      ...numbers,
    },
    errors,
  };
}

// The server's rules (AC-3), applied to the form when it saves so it matches the result.
function normalize(values: ListingFormValues): ListingFormValues {
  const next = { ...values };
  for (const field of typeRules[next.propertyType].empty) next[field] = null;
  if (next.completionStatus !== "UNDER_CONSTRUCTION") next.handoverDate = null;
  return next;
}

const sameAmenities = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

// Only what changed since the last save: an absent key leaves the field alone (AC-4).
function patchFrom(values: ListingFormValues, saved: ListingFormValues) {
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(values) as (keyof ListingFormValues)[]) {
    if (key === "amenityIds") {
      if (!sameAmenities(values.amenityIds, saved.amenityIds)) patch.amenityIds = values.amenityIds;
    } else if (values[key] !== saved[key]) {
      patch[key] = values[key];
    }
  }
  return patch;
}

// Fields shown for a type: everything except what the type must leave empty (AC-3).
const shows = (type: PropertyType, field: TypeField) => !typeRules[type].empty.includes(field);

// ---------------------------------------------------------------------------

export function ListingEditor({
  listing,
  areas,
  amenities,
  agents,
}: {
  listing: ListingForEdit;
  areas: { id: string; nameEn: string }[];
  amenities: { id: string; label: string }[];
  agents: { id: string; fullName: string }[];
}) {
  const [form, setForm] = useState<FormText>(() => toText(listing.values));
  const [saved, setSaved] = useState<ListingFormValues>(listing.values);
  const [photos, setPhotos] = useState<PhotoDTO[]>(listing.photos);
  const [status, setStatus] = useState<ListingStatus>(listing.status);
  const [assigned, setAssigned] = useState(listing.assignedAgent);
  const [owner, setOwner] = useState(listing.isOwner);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<{ reason: ListingMessageReason; missing?: string[] } | null>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<null | "unpublish" | "sold" | "delete">(null);
  const [reassignTo, setReassignTo] = useState(listing.assignedAgent?.id ?? "");
  const [pending, startTransition] = useTransition();

  // The conflict token (AC-13). Refs, so back to back actions read the latest.
  const token = useRef(listing.updatedAt);
  const staleRef = useRef(false);

  const canEdit = owner && status !== "SOLD";
  const isPublished = status === "PUBLISHED";
  const { values, errors: localErrors } = useMemo(() => parse(form), [form]);
  const checklist = publishChecklist(values, photos);
  const dirty = Object.keys(patchFrom(values, saved)).length > 0;
  const errors = { ...serverErrors, ...localErrors };

  const set = <K extends keyof FormText>(key: K, value: FormText[K]) => setForm((current) => ({ ...current, [key]: value }));

  const adopt = (result: { updatedAt: string; formStale?: true }) => {
    if (result.formStale) {
      staleRef.current = true;
      setStale(true);
    } else if (!staleRef.current) {
      token.current = result.updatedAt;
    }
  };

  const fail = (result: Extract<ActionOutcome, { ok: false }>) => {
    if (result.reason === "stale") {
      staleRef.current = true;
      setStale(true);
    }
    setError({ reason: result.reason, missing: result.missing });
    setServerErrors(
      Object.fromEntries(Object.entries(result.fieldErrors ?? {}).map(([key, message]) => [key, `${fieldLabels[key] ?? key}: ${message}`])),
    );
  };

  const runAction: RunAction = (call, done) =>
    startTransition(async () => {
      const result = await call(token.current);
      if (result.ok) {
        adopt(result);
        setError(null);
      } else {
        fail(result);
      }
      done?.(result);
    });

  // Save, or save and publish (AC-4, AC-5): only the changed fields go up.
  const submit = (mode: "save" | "publish") => {
    if (Object.keys(localErrors).length > 0) {
      setError({ reason: "invalid" });
      return;
    }
    const normalized = normalize(values);
    const fields = patchFrom(normalized, saved);
    runAction(
      (expectedUpdatedAt) => (mode === "save" ? saveListing : publish)({ id: listing.id, expectedUpdatedAt, fields }),
      (result) => {
        if (!result.ok) return;
        setSaved(normalized);
        setForm(toText(normalized));
        setServerErrors({});
        if (mode === "publish") setStatus("PUBLISHED");
        toast({ tone: "success", title: mode === "publish" ? "Listing published" : "Listing saved" });
      },
    );
  };

  const lifecycle = (kind: "unpublish" | "sold" | "delete") => {
    setConfirm(null);
    if (kind === "delete") {
      // Success redirects to the list.
      runAction(() => deleteDraft({ id: listing.id }));
      return;
    }
    runAction(
      (expectedUpdatedAt) => (kind === "unpublish" ? unpublish : markSold)({ id: listing.id, expectedUpdatedAt }),
      (result) => {
        if (!result.ok) return;
        setStatus(kind === "unpublish" ? "UNPUBLISHED" : "SOLD");
        toast({ tone: "success", title: kind === "unpublish" ? "Listing unpublished" : "Marked as sold" });
      },
    );
  };

  const doReassign = () =>
    runAction(
      (expectedUpdatedAt) => reassign({ id: listing.id, expectedUpdatedAt, agentId: reassignTo }),
      (result) => {
        if (!result.ok) return;
        const agent = agents.find((a) => a.id === reassignTo) ?? null;
        setAssigned(agent && { id: agent.id, name: agent.fullName });
        if (!listing.isCreator && reassignTo !== listing.assignedAgent?.id) setOwner(false);
        toast({
          tone: "success",
          title: "Listing reassigned",
          body: result.movedLeads > 0 ? `${result.movedLeads} open lead${result.movedLeads > 1 ? "s" : ""} moved with it.` : undefined,
        });
      },
    );

  // AC-3: warn before a type change clears entered values.
  const typeWarning = typeRules[form.propertyType].empty
    .filter((field) => saved[field] !== null && saved[field] !== undefined)
    .map((field) => typeFieldLabels[field]);

  const publishLabel = status === "UNPUBLISHED" ? "Publish again" : "Publish";
  const canPublish = status === "DRAFT" || status === "UNPUBLISHED";
  const message = error
    ? error.reason === "incomplete"
      ? `${listingMessages.incomplete} ${error.missing?.join(", ")}`
      : listingMessages[error.reason]
    : null;

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-6">
        <div>
          <p className="text-xs tracking-[.18em] text-fg-subtle uppercase">
            Properties · {listing.refCode}
          </p>
          <h1 className="mt-2 font-display text-3xl text-fg sm:text-4xl">{saved.title}</h1>
        </div>

        {stale ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-warning-subtle px-4 py-3 text-sm text-warning-subtle-fg">
            <p>{listingMessages.stale}</p>
            <Button type="button" intent="secondary" size="sm" onClick={() => window.location.reload()}>
              <RotateCw aria-hidden="true" strokeWidth={1.5} className="h-4 w-4" />
              Reload
            </Button>
          </div>
        ) : message ? (
          <p role="alert" className="rounded-xl bg-danger-subtle px-4 py-3 text-sm text-danger-subtle-fg">
            {message}
          </p>
        ) : null}

        {canEdit ? null : (
          <p className="flex items-start gap-3 rounded-xl bg-surface-sunken px-4 py-3 text-sm text-fg-muted">
            <Info aria-hidden="true" strokeWidth={1.5} className="mt-0.5 h-4 w-4 shrink-0" />
            {status === "SOLD"
              ? "This listing is sold, so it is read only."
              : `Only ${listing.createdBy} (who created it)${assigned && assigned.name !== listing.createdBy ? ` or ${assigned.name} (assigned)` : ""} can change this listing. Contact them for changes.`}
          </p>
        )}

        <fieldset disabled={!canEdit || pending} className="flex min-w-0 flex-col gap-6">
          <legend className="sr-only">Listing details</legend>

          <Panel title="Basics">
            <Field id="title" label="Title" error={errors.title} showError={Boolean(errors.title)}>
              <Input value={form.title} maxLength={120} onChange={(e) => set("title", e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="propertyType"
                label="Property type"
                hint={
                  form.propertyType !== saved.propertyType && typeWarning.length > 0
                    ? `Saving will clear: ${typeWarning.join(", ")}.`
                    : undefined
                }
              >
                <Select value={form.propertyType} onChange={(e) => set("propertyType", e.target.value as PropertyType)}>
                  {propertyTypes.map((type) => (
                    <option key={type} value={type}>
                      {propertyTypeLabels[type]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="areaId" label="Area">
                <Select value={form.areaId} onChange={(e) => set("areaId", e.target.value)}>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.nameEn}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field id="addressLine" label="Address" error={errors.addressLine} showError={Boolean(errors.addressLine)}>
              <Input value={form.addressLine} maxLength={200} autoComplete="off" onChange={(e) => set("addressLine", e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <Field
                id="price"
                label="Price (taka)"
                hint={values.priceBdt !== null ? formatPrice(values.priceBdt) : "Whole taka, commas allowed."}
                error={errors.priceBdt}
                showError={Boolean(errors.priceBdt)}
              >
                <Input value={form.price} inputMode="numeric" onChange={(e) => set("price", e.target.value)} />
              </Field>
              <Checkbox
                id="priceNegotiable"
                label="Negotiable"
                checked={form.priceNegotiable}
                onChange={(e) => set("priceNegotiable", e.target.checked)}
                className="sm:mb-3"
              />
            </div>
          </Panel>

          <Panel title="Details" description={`Fields for a ${propertyTypeLabels[form.propertyType].toLowerCase()}.`}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(["bedrooms", "bathrooms", "builtUpSqft", "landKatha", "floorNumber"] as const)
                .filter((field) => shows(form.propertyType, field))
                .map((field) => (
                  <Field
                    key={field}
                    id={field}
                    label={field === "builtUpSqft" ? "Built up size (sqft)" : field === "landKatha" ? "Land size (katha)" : typeFieldLabels[field]}
                    error={errors[field]}
                    showError={Boolean(errors[field])}
                  >
                    <Input
                      type="number"
                      inputMode={field === "landKatha" ? "decimal" : "numeric"}
                      step={field === "landKatha" ? "0.01" : "1"}
                      value={form[field]}
                      onChange={(e) => set(field, e.target.value)}
                    />
                  </Field>
                ))}
              {(["totalFloors", "parkingSpaces"] as const).map((field) => (
                <Field key={field} id={field} label={fieldLabels[field]} error={errors[field]} showError={Boolean(errors[field])}>
                  <Input type="number" inputMode="numeric" value={form[field]} onChange={(e) => set(field, e.target.value)} />
                </Field>
              ))}
              {shows(form.propertyType, "completionStatus") ? (
                <Field id="completionStatus" label="Completion status" error={errors.completionStatus} showError={Boolean(errors.completionStatus)}>
                  <Select
                    value={form.completionStatus}
                    onChange={(e) => set("completionStatus", e.target.value as FormText["completionStatus"])}
                  >
                    <option value="">Not set</option>
                    <option value="READY">Ready</option>
                    <option value="UNDER_CONSTRUCTION">Under construction</option>
                  </Select>
                </Field>
              ) : null}
              {form.completionStatus === "UNDER_CONSTRUCTION" && shows(form.propertyType, "completionStatus") ? (
                <Field id="handoverDate" label="Handover date" error={errors.handoverDate} showError={Boolean(errors.handoverDate)}>
                  <Input type="date" value={form.handoverDate} onChange={(e) => set("handoverDate", e.target.value)} />
                </Field>
              ) : null}
            </div>
          </Panel>

          <Panel title="Location">
            <LocationField
              latitude={form.latitude}
              longitude={form.longitude}
              disabled={!canEdit}
              onChange={({ latitude, longitude }) => setForm((current) => ({ ...current, latitude, longitude }))}
            />
            {errors.latitude ? (
              <p role="alert" className="text-xs font-medium text-danger">
                {errors.latitude}
              </p>
            ) : null}
          </Panel>

          <Panel title="Amenities">
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
          </Panel>

          <Panel title="Description" description="Plain text. Leave a blank line between paragraphs.">
            <Field
              id="description"
              label="Description"
              hint={`${form.description.trim().length.toLocaleString("en-US")} of ${descriptionMax.toLocaleString("en-US")} characters. Publishing needs at least 50.`}
              error={errors.description}
              showError={Boolean(errors.description)}
            >
              <Textarea rows={10} maxLength={descriptionMax} value={form.description} onChange={(e) => set("description", e.target.value)} />
            </Field>
          </Panel>
        </fieldset>

        <Panel title="Photos">
          <PhotoManager
            listingId={listing.id}
            photos={photos}
            setPhotos={setPhotos}
            canEdit={canEdit && !pending}
            isPublished={isPublished}
            runAction={runAction}
          />
        </Panel>
      </div>

      <aside className="flex flex-col gap-6 xl:sticky xl:top-24 xl:self-start">
        <div className="flex flex-col gap-4 rounded-3xl border border-line bg-surface-raised p-6 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <Badge tone={statusBadge[status].tone}>{statusBadge[status].label}</Badge>
            <span className="text-xs text-fg-muted">{listing.refCode}</span>
          </div>
          <p className="text-sm text-fg-muted">
            Advisor: <span className="text-fg">{assigned?.name ?? "Unassigned"}</span>
          </p>

          {status === "SOLD" ? null : (
            <div>
              <h2 className="text-sm font-medium text-fg">{isPublished ? "Required while published" : "To publish"}</h2>
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                {checklist.items.map((item) => (
                  <li key={item.label} className="flex items-start gap-2">
                    {item.met ? (
                      <Check aria-hidden="true" strokeWidth={2} className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    ) : (
                      <Circle aria-hidden="true" strokeWidth={1.5} className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" />
                    )}
                    <span className={item.met ? "text-fg" : "text-fg-muted"}>
                      {item.label}
                      <span className="sr-only">{item.met ? " (done)" : " (missing)"}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {canEdit ? (
            <div className="flex flex-col gap-2">
              <Button type="button" intent={canPublish ? "secondary" : "primary"} loading={pending} disabled={!dirty} onClick={() => submit("save")}>
                Save
              </Button>
              {canPublish ? (
                <Button type="button" loading={pending} disabled={!checklist.complete} onClick={() => submit("publish")}>
                  {publishLabel}
                </Button>
              ) : null}
              {isPublished ? (
                <Button type="button" intent="ghost" disabled={pending} onClick={() => setConfirm("unpublish")}>
                  Unpublish
                </Button>
              ) : null}
              {isPublished || status === "UNPUBLISHED" ? (
                <Button type="button" intent="ghost" disabled={pending} onClick={() => setConfirm("sold")}>
                  Mark sold
                </Button>
              ) : null}
              {status === "DRAFT" ? (
                <Button type="button" intent="ghost" disabled={pending} onClick={() => setConfirm("delete")}>
                  Delete draft
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        {canEdit && agents.length > 1 ? (
          <div className="flex flex-col gap-3 rounded-3xl border border-line bg-surface-raised p-6 shadow-soft">
            <h2 className="text-sm font-medium text-fg">Reassign</h2>
            <p className="text-xs text-fg-muted">Open leads on this listing move to the new agent too.</p>
            <Field id="reassign" label="Assigned agent">
              <Select value={reassignTo} onChange={(e) => setReassignTo(e.target.value)} disabled={pending}>
                {assigned ? null : <option value="">Choose an agent</option>}
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.fullName}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="button" intent="secondary" size="sm" disabled={pending || !reassignTo || reassignTo === assigned?.id} onClick={doReassign}>
              Reassign
            </Button>
          </div>
        ) : null}
      </aside>

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === "unpublish" ? "Unpublish this listing?" : confirm === "sold" ? "Mark as sold?" : "Delete this draft?"}
        description={
          confirm === "unpublish"
            ? "It leaves search, the assistant, and the public site at once. You can publish it again later."
            : confirm === "sold"
              ? "It leaves search and the assistant at once, and the listing becomes read only. This can't be undone."
              : "The draft and its photos are removed for good."
        }
        footer={
          <>
            <Button type="button" intent="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button type="button" intent={confirm === "delete" ? "danger" : "primary"} onClick={() => confirm && lifecycle(confirm)}>
              {confirm === "unpublish" ? "Unpublish" : confirm === "sold" ? "Mark sold" : "Delete"}
            </Button>
          </>
        }
      />
    </div>
  );
}

function Panel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-line bg-surface-raised p-6 shadow-soft sm:p-8">
      <div>
        <h2 className="font-display text-xl text-fg">{title}</h2>
        {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
