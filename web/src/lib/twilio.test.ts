import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock twilio before importing the module under test
const mockCreate = vi.fn();
vi.mock("twilio", () => ({
  default: vi.fn(() => ({
    messages: { create: mockCreate },
  })),
}));

describe("isDevAllowed", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("allows Micah's phone number", async () => {
    const { isDevAllowed } = await import("./twilio");
    expect(isDevAllowed("+14082099509")).toBe(true);
  });

  it("blocks other phone numbers in dev", async () => {
    const { isDevAllowed } = await import("./twilio");
    expect(isDevAllowed("+15551234567")).toBe(false);
  });

  it("blocks unknown numbers", async () => {
    const { isDevAllowed } = await import("./twilio");
    expect(isDevAllowed("+10000000000")).toBe(false);
  });

  it("never treats a missing number as allowed (#221)", async () => {
    const { isDevAllowed } = await import("./twilio");
    expect(isDevAllowed(null)).toBe(false);
  });
});

describe("sendSMS", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    mockCreate.mockReset();
  });

  it("treats a client with no phone number as a skip, not an error (#221)", async () => {
    // "We have no number for this client" is a real state now. It must not throw
    // — that would break every caller — and must not look like a delivery.
    const { sendSMS } = await import("./twilio");
    const result = await sendSMS(null, "Are you free Tuesday?");
    expect(result).toEqual({
      status: "skipped",
      reason: expect.stringContaining("no phone number"),
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("blocks non-dev numbers and reports the skip distinguishably", async () => {
    const { sendSMS } = await import("./twilio");
    const result = await sendSMS("+15551234567", "Hello test");
    expect(result).toEqual({ status: "skipped", reason: expect.stringContaining("not on the test allowlist") });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("sends via Twilio client for allowed numbers", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACtest123");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "authtoken123");
    vi.stubEnv("TWILIO_PHONE_NUMBER", "+12025551234");
    vi.stubEnv("TWILIO_USE_WHATSAPP", "false");

    mockCreate.mockResolvedValue({ sid: "SM_test_sid_123" });

    const { sendSMS } = await import("./twilio");
    const result = await sendSMS("+14082099509", "Session at 3pm", { consent: "confirmed" });

    expect(result).toEqual({ status: "sent", sid: "SM_test_sid_123" });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "Session at 3pm",
        from: "+12025551234",
        to: "+14082099509",
      })
    );
  });

  it("applies WhatsApp prefix when TWILIO_USE_WHATSAPP is true", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACtest123");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "authtoken123");
    vi.stubEnv("TWILIO_USE_WHATSAPP", "true");

    mockCreate.mockResolvedValue({ sid: "SM_whatsapp_sid" });

    const { sendSMS } = await import("./twilio");
    const result = await sendSMS("+14082099509", "WhatsApp msg", { consent: "confirmed" });

    expect(result).toEqual({ status: "sent", sid: "SM_whatsapp_sid" });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "whatsapp:+14155238886",
        to: "whatsapp:+14082099509",
      })
    );
  });

  it("includes statusCallback when NEXT_PUBLIC_APP_URL is set", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACtest123");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "authtoken123");
    vi.stubEnv("TWILIO_PHONE_NUMBER", "+12025551234");
    vi.stubEnv("TWILIO_USE_WHATSAPP", "false");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com");

    mockCreate.mockResolvedValue({ sid: "SM_callback_sid" });

    const { sendSMS } = await import("./twilio");
    await sendSMS("+14082099509", "Test callback", { consent: "confirmed" });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCallback: "https://example.com/api/twilio",
      })
    );
  });

  it("throws when TWILIO_PHONE_NUMBER is missing (non-WhatsApp)", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACtest123");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "authtoken123");
    vi.stubEnv("TWILIO_USE_WHATSAPP", "false");

    const { sendSMS } = await import("./twilio");
    await expect(sendSMS("+14082099509", "No from", { consent: "confirmed" })).rejects.toThrow(
      "TWILIO_PHONE_NUMBER must be set"
    );
  });

  it("propagates Twilio send errors", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACtest123");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "authtoken123");
    vi.stubEnv("TWILIO_PHONE_NUMBER", "+12025551234");
    vi.stubEnv("TWILIO_USE_WHATSAPP", "false");

    mockCreate.mockRejectedValue(new Error("Twilio API error: 21211"));

    const { sendSMS } = await import("./twilio");
    await expect(sendSMS("+14082099509", "Fail msg", { consent: "confirmed" })).rejects.toThrow(
      "Twilio API error: 21211"
    );
  });
});

describe("sendSMS — confirmed opt-in", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({ sid: "SM_test" });
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACtest");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "tok");
    vi.stubEnv("TWILIO_PHONE_NUMBER", "+15550000001");
  });

  it("sends a scheduling message to a confirmed client", async () => {
    const { sendSMS } = await import("./twilio");
    const r = await sendSMS("+14082099509", "Free Tuesday?", { consent: "confirmed" });
    expect(r.status).toBe("sent");
  });

  it("REFUSES a scheduling message to a client who has not confirmed", async () => {
    const { sendSMS } = await import("./twilio");
    for (const consent of ["unknown", "pending", "declined"] as const) {
      const r = await sendSMS("+14082099509", "Free Tuesday?", { consent });
      expect(r.status, consent).toBe("skipped");
      expect(mockCreate, consent).not.toHaveBeenCalled();
    }
  });

  it("defaults to the RESTRICTED purpose when a caller says nothing", async () => {
    // Fourteen call sites; a rule that must be remembered at each is a rule
    // that will be missed at one (#227). Forgetting must fail closed.
    const { sendSMS } = await import("./twilio");
    const r = await sendSMS("+14082099509", "Free Tuesday?", { consent: "unknown" });
    expect(r.status).toBe("skipped");
  });

  it("still delivers the consent request itself to an unconfirmed client", async () => {
    // Otherwise consent could never be obtained.
    const { sendSMS } = await import("./twilio");
    const r = await sendSMS("+14082099509", "Reply YES to confirm", {
      purpose: "consent_request",
      consent: "unknown",
    });
    expect(r.status).toBe("sent");
  });

  it("does NOT re-ask somebody who declined", async () => {
    const { sendSMS } = await import("./twilio");
    const r = await sendSMS("+14082099509", "Reply YES to confirm", {
      purpose: "consent_request",
      consent: "declined",
    });
    expect(r.status).toBe("skipped");
  });

  it("lets operational messages through regardless — alerts and replies", async () => {
    // Micah's own alerts, and replies to a client who just texted us.
    const { sendSMS } = await import("./twilio");
    const r = await sendSMS("+14082099509", "System alert", {
      purpose: "operational",
      consent: "unknown",
    });
    expect(r.status).toBe("sent");
  });

  it("reports WHY it skipped, so a caller can record it (#227)", async () => {
    const { sendSMS } = await import("./twilio");
    const r = await sendSMS("+14082099509", "Free Tuesday?", { consent: "pending" });
    if (r.status !== "skipped") throw new Error("expected a skip");
    expect(r.reason).toMatch(/confirm/i);
  });
});
