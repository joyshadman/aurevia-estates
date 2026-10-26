"use server";

import { isSupportedCountry, parsePhoneNumberFromString } from "libphonenumber-js/min";
import { z } from "zod";
import { withinAuthLimits } from "@/lib/server/auth-limits";
import { verifyCaptcha } from "@/lib/server/captcha";
import { createContactLead, type ContactInterest } from "@/lib/server/contact";
import type { ContactReason } from "./messages";

// The public contact form (spec 0015). Captcha first, then the rate limit,
// then validation; refusals are returned, never thrown (AC-3, AC-4).

const contactInput = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.union([z.literal(""), z.email().max(200)]),
  phone: z.string().trim().min(1).max(40),
  countryCode: z.string().length(2),
  interest: z.enum(["BUY", "SELL", "OTHER"]),
  message: z.string().trim().min(1).max(1000),
  whatsapp: z.boolean(),
  captchaToken: z.string().min(1).max(10_000),
});

export type ContactResult = { ok: true } | { ok: false; reason: ContactReason };

const reasonFor: Record<string, ContactReason> = {
  name: "invalid_name",
  email: "invalid_email",
  phone: "invalid_phone",
  countryCode: "invalid_phone",
  message: "invalid_message",
  captchaToken: "captcha_failed",
};

export async function sendContact(input: z.input<typeof contactInput>): Promise<ContactResult> {
  if (!(await verifyCaptcha(input.captchaToken))) return { ok: false, reason: "captcha_failed" };
  if (!(await withinAuthLimits("contact", "contact"))) return { ok: false, reason: "rate_limited" };

  const parsed = contactInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: reasonFor[String(parsed.error.issues[0]?.path[0])] ?? "invalid_message" };
  const { countryCode, phone, email, interest, ...rest } = parsed.data;

  if (!isSupportedCountry(countryCode)) return { ok: false, reason: "invalid_phone" };
  const number = parsePhoneNumberFromString(phone, countryCode);
  if (!number?.isValid()) return { ok: false, reason: "invalid_phone" };

  await createContactLead({ ...rest, email: email || null, phone: number.number, interest: interest as ContactInterest });
  return { ok: true };
}
