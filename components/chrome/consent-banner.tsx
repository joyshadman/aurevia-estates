"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { onOpenConsentSettings, openConsentSettings, useConsent, writeConsent, type Consent } from "@/lib/consent";

// The cookie card (spec 0017, AC-2, AC-3): two equal choices, nothing pre
// ticked. Shows until a choice is made, and again from "Cookie settings".
export function ConsentBanner() {
  const consent = useConsent();
  const [reopened, setReopened] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => onOpenConsentSettings(() => setReopened(true)), []);
  useEffect(() => {
    if (reopened) heading.current?.focus();
  }, [reopened]);

  // `undefined` until hydrated: render nothing rather than flash the card.
  if (consent === undefined || (consent !== null && !reopened)) return null;

  const choose = (value: Consent) => {
    writeConsent(value);
    setReopened(false);
  };

  return (
    <section
      aria-labelledby="consent-heading"
      className="fixed inset-x-0 bottom-0 z-40 p-4 sm:right-auto sm:left-4 sm:max-w-md sm:p-0 sm:pb-4"
    >
      <div className="rounded-2xl border border-line bg-surface-raised p-5 text-fg shadow-lift">
        <h2 id="consent-heading" ref={heading} tabIndex={-1} className="font-display text-lg outline-none">
          Cookies
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">
          We use essential cookies to keep you signed in. With your permission we also count visits and a few steps,
          like booking a viewing, to improve the site. No names, emails, or chat text.{" "}
          <Link href="/privacy" className="text-accent underline-offset-2 hover:underline">
            Privacy
          </Link>
        </p>
        {consent ? (
          <p className="mt-2 text-xs text-fg-subtle">
            Now: {consent === "analytics" ? "analytics allowed" : "essential only"}.
          </p>
        ) : null}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button type="button" intent="secondary" size="sm" onClick={() => choose("essential")}>
            Essential only
          </Button>
          <Button type="button" intent="secondary" size="sm" onClick={() => choose("analytics")}>
            Allow analytics
          </Button>
        </div>
      </div>
    </section>
  );
}

export function CookieSettingsButton() {
  return (
    <button type="button" onClick={openConsentSettings} className="text-left text-fg-muted hover:text-accent">
      Cookie settings
    </button>
  );
}
