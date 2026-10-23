"use client";

import { ExternalLink, MapPin } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { googleMapsLink } from "@/lib/domain/location";
import { resolveLocation } from "../actions";
import { listingMessages } from "../messages";

// Location (spec 0005, AC-7): coordinates, a Google Maps link, or a short link.
// The server answers with coordinates to 6 decimals, inside Bangladesh.
export function LocationField({
  latitude,
  longitude,
  disabled,
  onChange,
}: {
  latitude: number | null;
  longitude: number | null;
  disabled: boolean;
  onChange: (value: { latitude: number | null; longitude: number | null }) => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const find = () =>
    startTransition(async () => {
      const result = await resolveLocation({ input: text });
      if (!result.ok) {
        setError(listingMessages[result.reason]);
        return;
      }
      setError(null);
      setText("");
      onChange({ latitude: result.latitude, longitude: result.longitude });
    });

  const hasPoint = latitude !== null && longitude !== null;

  return (
    <div className="flex flex-col gap-4">
      {hasPoint ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-sunken px-4 py-3 text-sm">
          <span className="flex items-center gap-2 text-fg">
            <MapPin aria-hidden="true" strokeWidth={1.5} className="h-4 w-4 text-accent" />
            <span className="tabular-nums">
              {latitude}, {longitude}
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <a
              href={googleMapsLink(latitude, longitude)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-accent underline"
            >
              Open in Google Maps
              <ExternalLink aria-hidden="true" strokeWidth={1.5} className="h-3.5 w-3.5" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
            {disabled ? null : (
              <Button type="button" intent="ghost" size="sm" onClick={() => onChange({ latitude: null, longitude: null })}>
                Clear
              </Button>
            )}
          </span>
        </div>
      ) : (
        <p className="text-sm text-fg-muted">No location yet.</p>
      )}
      {disabled ? null : (
        <div className="flex flex-wrap items-end gap-3">
          <Field
            id="location-input"
            label={hasPoint ? "Change location" : "Location"}
            hint="Paste coordinates like 24.8949, 91.8687, or a Google Maps link. On a phone, long press the pin to copy them."
            error={error ?? undefined}
            showError={Boolean(error)}
            className="min-w-64 flex-1"
          >
            <Input
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (text.trim()) find();
                }
              }}
            />
          </Field>
          <Button type="button" intent="secondary" loading={pending} disabled={!text.trim()} onClick={find}>
            Find location
          </Button>
        </div>
      )}
    </div>
  );
}
