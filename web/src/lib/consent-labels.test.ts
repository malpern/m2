import { describe, it, expect } from "vitest";
import { consentChip, consentStatusLabel, describeConsentEvent } from "./consent-labels";
import type { ConsentEvent } from "@/db/schema";

function ev(o: Partial<ConsentEvent>): ConsentEvent {
  return { id: 1, phone: "+14085550100", clientId: 1, event: "signed_up", method: "web_form", actor: "client", role: "client",
    consentTextVersion: null, submittedName: null, guardianName: null, guardianPhone: null, evidence: null, createdAt: "2026-09-08T00:00:00Z", ...o };
}

describe("consentChip", () => {
  it("is quiet for confirmed clients and for clients with no phone", () => {
    expect(consentChip("confirmed", true)).toBeNull();
    expect(consentChip("unknown", false)).toBeNull();
  });
  it("flags everyone with a number who cannot be texted yet", () => {
    expect(consentChip("unknown", true)).toEqual({ label: "not signed up", tone: "none" });
    expect(consentChip("pending", true)).toEqual({ label: "pending", tone: "warn" });
    expect(consentChip("declined", true)).toEqual({ label: "opted out", tone: "bad" });
  });
  it("labels every status", () => {
    expect(consentStatusLabel("unknown")).toBe("Not signed up");
    expect(consentStatusLabel("declined")).toBe("Opted out");
  });
});

describe("describeConsentEvent", () => {
  it("names the guardian when one agreed", () => {
    expect(describeConsentEvent(ev({ submittedName: "Jordan Lee", guardianName: "Dana Lee", consentTextVersion: "v1" })))
      .toBe("Signed up at m2scheduler.com/text-signup as Jordan Lee; parent/guardian Dana Lee agreed · consent text v1");
  });
  it("distinguishes a YES reply from an unprompted keyword and from Matt's manual opt-out", () => {
    expect(describeConsentEvent(ev({ event: "confirmed", method: "sms_reply", evidence: "Yes · SM1" }))).toBe('Replied YES · "Yes · SM1"');
    expect(describeConsentEvent(ev({ event: "confirmed", method: "sms_keyword", evidence: "START" }))).toMatch(/unprompted/);
    expect(describeConsentEvent(ev({ event: "declined", method: "manual", evidence: "at the gym" }))).toBe("Matt marked them opted out · at the gym");
    expect(describeConsentEvent(ev({ event: "declined", method: "sms_reply", evidence: "STOP" }))).toBe('Opted out by text · "STOP"');
  });
  it("describes resets and links", () => {
    expect(describeConsentEvent(ev({ event: "reset", evidence: "phone changed from +1 to +2" }))).toBe("Consent reset: phone changed from +1 to +2");
    expect(describeConsentEvent(ev({ event: "linked" }))).toBe("Signup for (408) 555-0100 linked to this client");
  });
});
