"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

// The hCaptcha widget for the contact form (spec 0014), rendered explicitly so
// it can be reset after a failed submit.

type HCaptchaApi = {
  render: (el: HTMLElement, options: { sitekey: string; callback: (token: string) => void; "expired-callback": () => void; "error-callback": () => void }) => string;
  reset: (id: string) => void;
};

declare global {
  interface Window {
    hcaptcha?: HCaptchaApi;
  }
}

export function HCaptcha({ siteKey, onToken, resetKey }: { siteKey: string; onToken: (token: string) => void; resetKey: number }) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [ready, setReady] = useState(() => typeof window !== "undefined" && Boolean(window.hcaptcha));
  const tokenRef = useRef(onToken);
  useEffect(() => {
    tokenRef.current = onToken;
  });

  useEffect(() => {
    if (!ready || !box.current || widget.current !== null || !window.hcaptcha) return;
    widget.current = window.hcaptcha.render(box.current, {
      sitekey: siteKey,
      callback: (token) => tokenRef.current(token),
      "expired-callback": () => tokenRef.current(""),
      "error-callback": () => tokenRef.current(""),
    });
  }, [ready, siteKey]);

  useEffect(() => {
    if (resetKey > 0 && widget.current !== null) {
      window.hcaptcha?.reset(widget.current);
      tokenRef.current("");
    }
  }, [resetKey]);

  return (
    <>
      <Script src="https://js.hcaptcha.com/1/api.js?render=explicit" strategy="lazyOnload" onReady={() => setReady(true)} />
      <div ref={box} />
    </>
  );
}
