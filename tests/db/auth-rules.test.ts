import { describe, expect, it } from "vitest";
import {
  agentGate,
  amrEntries,
  defaultLanding,
  hasFreshMfa,
  MFA_FRESH_MS,
  passwordRule,
  safeNext,
  withinEnrollWindow,
} from "@/lib/domain/auth-rules";

// Spec 0004: the pure sign in rules.

const site = "https://aurevia.example";
const now = Date.UTC(2026, 9, 19, 12, 0, 0);
const seconds = (ms: number) => Math.floor(ms / 1000);

describe("AC-11: safeNext", () => {
  it("keeps same site paths with their query", () => {
    expect(safeNext("/assistant?q=flat", site)).toBe("/assistant?q=flat");
    expect(safeNext("/dashboard/leads", site)).toBe("/dashboard/leads");
  });

  it("drops every open redirect trick and the auth and api areas", () => {
    for (const value of [
      "//evil.example",
      "https://evil.example",
      "/\\evil.example",
      "/%2f%2fevil.example",
      "/%5Cevil.example",
      "/\tevil.example",
      "evil.example",
      "",
      "/auth/confirm",
      "/api/chat",
      `/${"a".repeat(600)}`,
      42,
      null,
    ]) {
      expect(safeNext(value, site), String(value)).toBeNull();
    }
  });
});

describe("AC-12: default landing", () => {
  it("sends agents to leads and everyone else to the assistant", () => {
    expect(defaultLanding("AGENT")).toBe("/dashboard/leads");
    expect(defaultLanding("VISITOR")).toBe("/assistant");
    expect(defaultLanding("SELLER")).toBe("/assistant");
  });
});

describe("AC-3: password rule", () => {
  it("needs 8 characters with a letter and a digit", () => {
    expect(passwordRule.safeParse("abc12345").success).toBe(true);
    expect(passwordRule.safeParse("abcdefgh").success).toBe(false);
    expect(passwordRule.safeParse("12345678").success).toBe(false);
    expect(passwordRule.safeParse("ab1").success).toBe(false);
  });
});

describe("AC-8, AC-9: the agent gate and MFA freshness", () => {
  const totp = (agoMs: number) => ({ method: "totp", timestamp: seconds(now - agoMs) });
  const password = (agoMs: number) => ({ method: "password", timestamp: seconds(now - agoMs) });

  it("routes no factor to setup, a stale or missing code to /mfa, and a fresh code through", () => {
    expect(agentGate({ hasVerifiedTotp: false, level: "aal1", amr: [password(0)], now })).toBe("setup");
    expect(agentGate({ hasVerifiedTotp: true, level: "aal1", amr: [password(0)], now })).toBe("mfa");
    expect(agentGate({ hasVerifiedTotp: true, level: "aal2", amr: [password(0), totp(13 * 3600_000)], now })).toBe("mfa");
    expect(agentGate({ hasVerifiedTotp: true, level: "aal2", amr: [password(0), totp(60_000)], now })).toBe("ok");
    expect(hasFreshMfa("aal2", [totp(MFA_FRESH_MS)], now)).toBe(true);
    expect(hasFreshMfa("aal2", [totp(MFA_FRESH_MS + 1000)], now)).toBe(false);
  });

  it("ignores plain method names without timestamps", () => {
    expect(amrEntries(["password", "totp"])).toEqual([]);
    expect(agentGate({ hasVerifiedTotp: true, level: "aal2", amr: amrEntries(["totp"]), now })).toBe("mfa");
  });

  it("lets an agent enroll only within 15 minutes of signing in", () => {
    expect(withinEnrollWindow([password(10 * 60_000)], now)).toBe(true);
    expect(withinEnrollWindow([password(20 * 60_000)], now)).toBe(false);
    expect(withinEnrollWindow([], now)).toBe(false);
  });
});
