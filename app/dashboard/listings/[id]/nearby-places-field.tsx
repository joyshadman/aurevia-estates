"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { maxNearbyPlaces, placeKindLabels, placeKinds, type PlaceKind, type TravelMode } from "@/lib/maps";
import { newPlaceRow, type PlaceRow } from "./form-values";

// "Around the address" (spec 0011, AC-6): up to 8 places, in the order buyers
// see them. Saved with the form, replacing the listing's set.
export function NearbyPlacesField({
  rows,
  onChange,
  errors,
  showErrors,
}: {
  rows: PlaceRow[];
  onChange: (rows: PlaceRow[]) => void;
  errors: Record<string, string>;
  showErrors: boolean;
}) {
  const focusNext = useRef<string | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);

  // After a change, keep focus where the agent was working.
  useEffect(() => {
    if (!focusNext.current) return;
    const target = focusNext.current === "add" ? addButton.current : document.getElementById(focusNext.current);
    target?.focus();
    focusNext.current = null;
  }, [rows]);

  const update = (key: string, patch: Partial<PlaceRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (index: number, by: -1 | 1) => {
    const next = [...rows];
    const [row] = next.splice(index, 1);
    next.splice(index + by, 0, row);
    // A button that would vanish at the edge hands focus to the other one.
    const edge = index + by === 0 || index + by === rows.length - 1;
    focusNext.current = `${row.key}-${edge ? (by === -1 ? "down" : "up") : by === -1 ? "up" : "down"}`;
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-fg-muted">
        Schools, mosques, markets, and other places buyers ask about, with typical travel times. Optional; up to {maxNearbyPlaces}.
      </p>
      {rows.length > 0 ? (
        <ol className="flex flex-col gap-3">
          {rows.map((row, i) => {
            const label = row.name.trim() || `place ${i + 1}`;
            const err = (field: string) => errors[`nearbyPlaces.${i}.${field}`];
            return (
              <li key={row.key}>
                <fieldset className="grid gap-3 rounded-xl border border-line p-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_6rem_7rem_auto] sm:items-end">
                  <legend className="sr-only">Place {i + 1}</legend>
                  <Field id={`${row.key}-name`} label="Name" error={err("name")} showError={showErrors}>
                    <Input value={row.name} maxLength={80} onChange={(e) => update(row.key, { name: e.target.value })} />
                  </Field>
                  <Field id={`${row.key}-kind`} label="Kind">
                    <Select value={row.kind} onChange={(e) => update(row.key, { kind: e.target.value as PlaceKind })}>
                      {placeKinds.map((kind) => (
                        <option key={kind} value={kind}>
                          {placeKindLabels[kind]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field id={`${row.key}-minutes`} label="Minutes" error={err("minutes")} showError={showErrors}>
                    <Input inputMode="numeric" value={row.minutes} onChange={(e) => update(row.key, { minutes: e.target.value })} />
                  </Field>
                  <Field id={`${row.key}-mode`} label="By">
                    <Select value={row.mode} onChange={(e) => update(row.key, { mode: e.target.value as TravelMode })}>
                      <option value="WALK">Walk</option>
                      <option value="DRIVE">Drive</option>
                    </Select>
                  </Field>
                  <div className="flex gap-1">
                    {i > 0 ? (
                      <Button id={`${row.key}-up`} type="button" size="sm" intent="ghost" icon aria-label={`Move ${label} up`} onClick={() => move(i, -1)}>
                        <ArrowUp aria-hidden="true" className="h-4 w-4" />
                      </Button>
                    ) : null}
                    {i < rows.length - 1 ? (
                      <Button id={`${row.key}-down`} type="button" size="sm" intent="ghost" icon aria-label={`Move ${label} down`} onClick={() => move(i, 1)}>
                        <ArrowDown aria-hidden="true" className="h-4 w-4" />
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      intent="ghost"
                      icon
                      aria-label={`Remove ${label}`}
                      onClick={() => {
                        focusNext.current = "add";
                        onChange(rows.filter((r) => r.key !== row.key));
                      }}
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                    </Button>
                  </div>
                </fieldset>
              </li>
            );
          })}
        </ol>
      ) : null}
      {errors.nearbyPlaces && showErrors ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {errors.nearbyPlaces}
        </p>
      ) : null}
      <Button
        ref={addButton}
        type="button"
        intent="secondary"
        size="sm"
        className="self-start"
        disabled={rows.length >= maxNearbyPlaces}
        onClick={() => {
          const row = newPlaceRow();
          focusNext.current = `${row.key}-name`;
          onChange([...rows, row]);
        }}
      >
        <Plus aria-hidden="true" className="h-4 w-4" />
        {rows.length >= maxNearbyPlaces ? `${maxNearbyPlaces} places is the most` : "Add a place"}
      </Button>
    </div>
  );
}
