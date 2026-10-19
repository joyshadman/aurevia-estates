import { beforeAll, describe, expect, it } from "vitest";
import type { ContactInput } from "@/lib/domain/contact";
import type { Actor } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { submitContact } from "@/lib/server/contact";
import { listLeads } from "@/lib/server/lead-inbox";
import { createProfile } from "./support/fixtures";

// Spec 0014 (assumed): the contact form becomes a lead in the inbox.

let agent: Actor;
const pass = async () => true;
const fail = async () => false;

beforeAll(async () => {
  ({ actor: agent } = await createProfile("AGENT"));
});

const form = (overrides: Partial<ContactInput> = {}): ContactInput => ({
  name: "Tanvir Ahmed",
  email: `tanvir.${Date.now().toString(36)}@test.example`,
  phone: "01711 204580",
  countryCode: "BD",
  whatsapp: true,
  intent: "sell",
  propertyType: "APARTMENT",
  message: "A 3 bedroom flat in Ambarkhana; we'd like a valuation.",
  captchaToken: "token",
  ...overrides,
});

const leadsFor = (email: string) => db.lead.findMany({ where: { contactEmail: email }, include: { activities: true } });

describe("the contact form", () => {
  it("writes nothing while the form is off, or when the captcha fails", async () => {
    const off = form();
    expect(await submitContact(off, { enabled: false, verify: pass })).toEqual({ ok: false, reason: "disabled" });
    const failed = form();
    expect(await submitContact(failed, { enabled: true, verify: fail })).toEqual({ ok: false, reason: "captcha" });
    expect(await leadsFor(off.email)).toHaveLength(0);
    expect(await leadsFor(failed.email)).toHaveLength(0);
  });

  it("returns field errors: name, message, an email or a phone, a valid phone", async () => {
    const result = await submitContact(form({ name: " ", message: "", email: "", phone: "" }), { enabled: true, verify: pass });
    expect(result).toMatchObject({ ok: false, reason: "invalid", fieldErrors: { name: expect.any(String), message: expect.any(String), email: expect.any(String) } });
    expect(await submitContact(form({ phone: "123" }), { enabled: true, verify: pass })).toMatchObject({ reason: "invalid", fieldErrors: { phone: expect.any(String) } });
    expect(await submitContact(form({ email: "not an email" }), { enabled: true, verify: pass })).toMatchObject({ reason: "invalid", fieldErrors: { email: expect.any(String) } });
  });

  it("creates an unassigned CONTACT_FORM lead that every agent sees in the inbox", async () => {
    const input = form();
    expect(await submitContact(input, { enabled: true, verify: pass })).toEqual({ ok: true, name: "Tanvir Ahmed" });
    const [lead] = await leadsFor(input.email);
    expect(lead).toMatchObject({
      source: "CONTACT_FORM",
      status: "NEW",
      visitorId: null,
      listingId: null,
      assignedAgentId: null,
      contactPhone: "+8801711204580",
      contactWhatsapp: true,
      message: `Sell my property · Apartment\n\n${input.message}`,
    });
    expect(lead.activities).toMatchObject([{ type: "SYSTEM", body: "Lead created from the contact form" }]);

    const inbox = await listLeads({ tab: "new", mine: false }, agent);
    expect(inbox.rows.some((row) => row.id === lead.id)).toBe(true);
  });

  it("links a signed in visitor, and keeps WhatsApp empty without a phone", async () => {
    const { actor: visitor } = await createProfile("VISITOR");
    const input = form({ phone: "", propertyType: null, intent: "buy" });
    expect(await submitContact(input, { enabled: true, verify: pass, visitor })).toMatchObject({ ok: true });
    const [lead] = await leadsFor(input.email);
    expect(lead).toMatchObject({ visitorId: visitor.id, contactPhone: null, contactWhatsapp: null, message: `Buy a home\n\n${input.message}` });
    expect(lead.activities[0].actorId).toBe(visitor.id);
  });
});
