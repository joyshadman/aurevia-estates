import "server-only";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { contactInput, contactSummary, type ContactInput } from "@/lib/domain/contact";
import type { Actor } from "@/lib/server/auth";
import { captchaEnabled, verifyCaptcha, type CaptchaVerifier } from "@/lib/server/captcha";
import { db } from "@/lib/server/db";

// The contact form (spec 0014): one unassigned CONTACT_FORM lead per submission,
// which every agent sees in the inbox (spec 0008).

export type ContactResult =
  | { ok: true; name: string }
  | { ok: false; reason: "invalid"; fieldErrors: Record<string, string> }
  | { ok: false; reason: "captcha" | "disabled" };

type Options = { visitor?: Actor | null; verify?: CaptchaVerifier; enabled?: boolean };

export async function submitContact(raw: ContactInput, options: Options = {}): Promise<ContactResult> {
  const { visitor = null, verify = verifyCaptcha, enabled = captchaEnabled() } = options;
  if (!enabled) return { ok: false, reason: "disabled" };

  const parsed = contactInput.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { ok: false, reason: "invalid", fieldErrors };
  }
  const input = parsed.data;

  let phone: string | null = null;
  if (input.phone) {
    const number = parsePhoneNumberFromString(input.phone, input.countryCode.toUpperCase() as CountryCode);
    if (!number?.isValid()) return { ok: false, reason: "invalid", fieldErrors: { phone: "Check the number and the country" } };
    phone = number.number;
  }

  // Verified before any write; a failed check writes nothing.
  if (!(await verify(input.captchaToken))) return { ok: false, reason: "captcha" };

  await db.$transaction(async (tx) => {
    const lead = await tx.lead.create({
      data: {
        source: "CONTACT_FORM",
        visitorId: visitor?.id ?? null,
        contactName: input.name,
        contactEmail: input.email || null,
        contactPhone: phone,
        contactWhatsapp: phone ? input.whatsapp : null,
        message: `${contactSummary(input.intent, input.propertyType)}\n\n${input.message}`,
      },
    });
    await tx.leadActivity.create({ data: { leadId: lead.id, actorId: visitor?.id ?? null, type: "SYSTEM", body: "Lead created from the contact form" } });
  });
  return { ok: true, name: input.name };
}
