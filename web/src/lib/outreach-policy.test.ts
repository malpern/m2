import { describe, it, expect, beforeEach, vi } from "vitest";
import { canContact, canContactSms, canContactEmail, isOutreachLive } from "./outreach-policy";

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe("isOutreachLive", () => {
  it("requires BOTH production and the explicit flag", () => {
    expect(isOutreachLive()).toBe(false);

    vi.stubEnv("OUTREACH_LIVE", "true");
    expect(isOutreachLive()).toBe(false); // not production

    vi.stubEnv("NODE_ENV", "production");
    expect(isOutreachLive()).toBe(true);
  });

  it("is not fooled by a truthy-looking value", () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const v of ["1", "yes", "TRUE", "on"]) {
      vi.stubEnv("OUTREACH_LIVE", v);
      expect(isOutreachLive()).toBe(false);
    }
  });
});

describe("canContact — SMS while outreach is off", () => {
  it("allows the test number", () => {
    expect(canContact({ channel: "sms", address: "+14082099509" })).toEqual({ allowed: true });
  });

  it("matches the test number however it is formatted", () => {
    // The same number arrives as E.164 from the schema, formatted from a form,
    // and prefixed from Twilio. An allowlist that only matched one shape would
    // fail open in the confusing direction.
    for (const v of ["+1 408 209 9509", "(408) 209-9509", "4082099509", "whatsapp:+14082099509"]) {
      expect(canContact({ channel: "sms", address: v }).allowed, v).toBe(true);
    }
  });

  it("refuses any other number, with a reason", () => {
    const d = canContact({ channel: "sms", address: "+14155550123" });
    expect(d.allowed).toBe(false);
    if (d.allowed) return;
    expect(d.reason).toContain("not on the test allowlist");
  });

  it("refuses a missing number rather than throwing", () => {
    // 55 of 56 production clients have phone = NULL since #221.
    const d = canContact({ channel: "sms", address: null });
    expect(d.allowed).toBe(false);
    if (d.allowed) return;
    expect(d.reason).toContain("no phone number on file");
  });

  it("refuses something that is not a phone number at all", () => {
    const d = canContact({ channel: "sms", address: "12345" });
    expect(d.allowed).toBe(false);
    if (d.allowed) return;
    expect(d.reason).toContain("not a usable sms address");
  });
});

describe("canContact — email while outreach is off", () => {
  it("allows the test address, case-insensitively", () => {
    expect(canContact({ channel: "email", address: "malpern@gmail.com" }).allowed).toBe(true);
    expect(canContact({ channel: "email", address: "  MalPern@Gmail.COM " }).allowed).toBe(true);
  });

  it("refuses any other address", () => {
    expect(canContact({ channel: "email", address: "client@example.com" }).allowed).toBe(false);
  });

  it("refuses a missing address", () => {
    const d = canContact({ channel: "email", address: undefined });
    expect(d.allowed).toBe(false);
    if (d.allowed) return;
    expect(d.reason).toContain("no email address on file");
  });
});

describe("channels do not leak into each other", () => {
  it("does not let the allowed phone through as an email", () => {
    expect(canContact({ channel: "email", address: "+14082099509" }).allowed).toBe(false);
  });

  it("does not let the allowed email through as a phone", () => {
    expect(canContact({ channel: "sms", address: "malpern@gmail.com" }).allowed).toBe(false);
  });
});

describe("OUTREACH_TEST_RECIPIENTS", () => {
  it("adds recipients without a code change", () => {
    vi.stubEnv("OUTREACH_TEST_RECIPIENTS", "+14155550123, tester@example.com");
    expect(canContact({ channel: "sms", address: "+14155550123" }).allowed).toBe(true);
    expect(canContact({ channel: "email", address: "tester@example.com" }).allowed).toBe(true);
  });

  it("is additive — it cannot remove the built-in test recipients", () => {
    // A typo'd override must not silently cut Micah off from his own alerts.
    vi.stubEnv("OUTREACH_TEST_RECIPIENTS", "someone@else.com");
    expect(canContact({ channel: "email", address: "malpern@gmail.com" }).allowed).toBe(true);
    expect(canContact({ channel: "sms", address: "+14082099509" }).allowed).toBe(true);
  });

  it("still refuses everyone else", () => {
    vi.stubEnv("OUTREACH_TEST_RECIPIENTS", "tester@example.com");
    expect(canContact({ channel: "email", address: "client@example.com" }).allowed).toBe(false);
  });
});

describe("when outreach IS live", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OUTREACH_LIVE", "true");
  });

  it("allows any real client", () => {
    expect(canContact({ channel: "sms", address: "+14155550123" }).allowed).toBe(true);
    expect(canContact({ channel: "email", address: "client@example.com" }).allowed).toBe(true);
  });

  it("STILL refuses a missing address — live is not a licence to send nowhere", () => {
    expect(canContact({ channel: "sms", address: null }).allowed).toBe(false);
    expect(canContact({ channel: "email", address: "" }).allowed).toBe(false);
  });

  it("still refuses a malformed address", () => {
    expect(canContact({ channel: "sms", address: "123" }).allowed).toBe(false);
    expect(canContact({ channel: "email", address: "not-an-email" }).allowed).toBe(false);
  });
});

describe("predicates narrow their argument", () => {
  it("canContactSms rejects null", () => {
    expect(canContactSms(null)).toBe(false);
    expect(canContactSms("+14082099509")).toBe(true);
  });

  it("canContactEmail rejects null", () => {
    expect(canContactEmail(null)).toBe(false);
    expect(canContactEmail("malpern@gmail.com")).toBe(true);
  });
});
