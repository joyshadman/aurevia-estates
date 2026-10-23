"use client";

import HCaptcha from "@hcaptcha/react-hcaptcha";
import { useRef } from "react";
import { publicEnv } from "@/lib/env";

// The invisible hCaptcha every public auth request carries (spec 0008, AC-4),
// shared by `/sign-in` and `/auth/confirm`.

const captchaLoadTimeoutMs = 10_000;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

function withTimeout(promise: Promise<void>, ms: number) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("hCaptcha did not load")), ms)),
  ]);
}

// `token()` returns a fresh token per request (tokens work once). It first
// waits for the hCaptcha script, so a quick first click still works. The widget
// resets after every attempt; null means captcha_failed. Render `widget` once,
// at a fixed position, so React keeps it mounted.
export function useInvisibleCaptcha() {
  const captchaRef = useRef<HCaptcha>(null);
  const ready = useRef(deferred());

  const token = async () => {
    try {
      await withTimeout(ready.current.promise, captchaLoadTimeoutMs);
      const result = await captchaRef.current?.execute({ async: true });
      return result?.response ?? null;
    } catch {
      return null;
    } finally {
      captchaRef.current?.resetCaptcha();
    }
  };

  const widget = (
    <div>
      <HCaptcha
        ref={captchaRef}
        sitekey={publicEnv().NEXT_PUBLIC_HCAPTCHA_SITE_KEY}
        size="invisible"
        onLoad={() => ready.current.resolve()}
      />
      <CaptchaNotice />
    </div>
  );

  return { token, widget };
}

// hCaptcha asks for this notice when the widget is invisible.
function CaptchaNotice() {
  return (
    <p className="text-xs text-fg-muted">
      Protected by hCaptcha. Its{" "}
      <a href="https://www.hcaptcha.com/privacy" className="underline hover:text-accent" rel="noopener" target="_blank">
        privacy policy
      </a>{" "}
      and{" "}
      <a href="https://www.hcaptcha.com/terms" className="underline hover:text-accent" rel="noopener" target="_blank">
        terms
      </a>{" "}
      apply.
    </p>
  );
}
