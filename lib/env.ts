import { z } from "zod";

// Public variables only (safe in the browser). Server only values live in
// `lib/server/env.ts`. Each `process.env.NEXT_PUBLIC_*` is written out in full
// so Next.js can inline it into client bundles.
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  // The canonical origin: every redirect and email link is built from it, never
  // the request Host (spec 0004, AC-11). Required in production.
  NEXT_PUBLIC_SITE_URL: z
    .url()
    .optional()
    .transform((value, ctx) => {
      if (value) return value.replace(/\/$/, "");
      if (process.env.NODE_ENV === "production") {
        ctx.addIssue({ code: "custom", message: "NEXT_PUBLIC_SITE_URL is required in production" });
        return z.NEVER;
      }
      return "http://localhost:3000";
    }),
  // The contact form's hCaptcha widget (spec 0014). Without it the form stays off.
  NEXT_PUBLIC_HCAPTCHA_SITE_KEY: z.string().min(1).optional(),
  // MapTiler tiles and static maps (spec 0011). Optional: maps degrade without it (AC-9).
  NEXT_PUBLIC_MAPTILER_KEY: z.string().min(1).optional(),
});

export type PublicEnv = z.infer<typeof publicSchema>;

let cached: PublicEnv | undefined;

export function publicEnv(): PublicEnv {
  cached ??= publicSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_HCAPTCHA_SITE_KEY: process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY || undefined,
    NEXT_PUBLIC_MAPTILER_KEY: process.env.NEXT_PUBLIC_MAPTILER_KEY || undefined,
  });
  return cached;
}
