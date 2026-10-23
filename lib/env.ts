import { z } from "zod";

// Public variables only (safe in the browser). Server only values live in
// `lib/server/env.ts`. Each `process.env.NEXT_PUBLIC_*` is written out in full
// so Next.js can inline it into client bundles.
const publicSchema = z.object({
  // The canonical origin: every redirect and email link is built from it, never
  // the request `Host` (spec 0008, AC-11).
  NEXT_PUBLIC_SITE_URL: z.url(),
  // hCaptcha site key (spec 0008, AC-4). Locally the test key `10000000-ffff-ffff-ffff-000000000001`.
  NEXT_PUBLIC_HCAPTCHA_SITE_KEY: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicSchema>;

let cached: PublicEnv | undefined;

export function publicEnv(): PublicEnv {
  cached ??= publicSchema.parse({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_HCAPTCHA_SITE_KEY: process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY,
  });
  return cached;
}
