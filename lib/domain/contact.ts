import { z } from "zod";
import { propertyTypeLabels, propertyTypes } from "@/lib/domain/listing-card";

// The contact form's shape (spec 0014), shared by the form and the server.

export const contactIntents = ["buy", "sell", "valuation", "other"] as const;
export type ContactIntent = (typeof contactIntents)[number];

export const contactIntentLabels: Record<ContactIntent, string> = {
  buy: "Buy a home",
  sell: "Sell my property",
  valuation: "Get a valuation",
  other: "Something else",
};

export const contactInput = z
  .object({
    name: z.string().trim().min(1, "Enter your name").max(80, "Up to 80 characters"),
    email: z
      .string()
      .trim()
      .max(254)
      .refine((v) => v === "" || z.email().safeParse(v).success, "Check the email address"),
    phone: z.string().trim().max(30),
    countryCode: z.string().length(2),
    whatsapp: z.boolean(),
    intent: z.enum(contactIntents),
    propertyType: z.enum(propertyTypes).nullable(),
    message: z.string().trim().min(1, "Write a short message").max(1000, "Up to 1000 characters"),
    captchaToken: z.string().max(4096),
  })
  .refine((v) => v.email !== "" || v.phone !== "", { path: ["email"], message: "Give an email or a phone number" });

export type ContactInput = z.input<typeof contactInput>;

// The first line of `leads.message`, so the inbox shows what the person wants.
export function contactSummary(intent: ContactIntent, propertyType: (typeof propertyTypes)[number] | null): string {
  return propertyType ? `${contactIntentLabels[intent]} · ${propertyTypeLabels[propertyType]}` : contactIntentLabels[intent];
}
